import type {
  DocumentType,
  ReviewProgress,
  UploadAccepted,
  VersionStatus,
} from '@doc-review/shared';
import { isUniqueViolation } from '../db/pg-errors.js';
import { ConflictError, NotFoundError } from '../errors.js';
import {
  type DocumentRow,
  findDocument,
  findLatestVersion,
  findVersionText,
  insertDocument,
  insertQueuedJob,
  insertVersion,
  listVersions,
  lockDocument,
  requeueVersion,
  supersedeInFlightWork,
  type VersionRow,
} from '../repositories/documents.repository.js';
import {
  type DocumentSummaryView,
  getVersionProgress,
  listDocumentSummaries,
  listValueViews,
  type ValueView,
} from '../repositories/read-models.repository.js';
import { versionFileKey } from '../storage/file-storage.js';
import { sha256Hex } from '../uploads/pdf.js';
import type { ServiceDeps } from './deps.js';
import { orderByFieldDefinitions } from './field-order.js';
import { inTransactionWithFile } from './stored-upload.js';

/** A validated PDF upload (signature and media type already checked at the HTTP boundary). */
export interface PdfUpload {
  contents: Buffer;
  filename: string;
}

export interface DocumentDetailView {
  document: DocumentRow & { currentVersionNo: number };
  version: VersionRow & { baselineVersionNo: number | null; parsedText: string | null };
  versions: VersionRow[];
  values: ValueView[];
}

const FIRST_VERSION_NO = 1;

function defaultTitle(type: DocumentType, filename: string): string {
  const withoutExtension = filename.replace(/\.pdf$/i, '').trim();
  return withoutExtension || `Untitled ${type.replace('_', ' ')}`;
}

/** Creates document + version 1 + a queued job. Returns at once; extraction happens later. */
export async function createDocument(
  { db, storage }: ServiceDeps,
  input: { type: DocumentType; title: string | undefined; file: PdfUpload },
): Promise<UploadAccepted> {
  const sha256 = sha256Hex(input.file.contents);
  return inTransactionWithFile(db, storage, async (tx, writeFile) => {
    const document = await insertDocument(tx, {
      type: input.type,
      title: input.title ?? defaultTitle(input.type, input.file.filename),
    });
    const filePath = versionFileKey(document.id, FIRST_VERSION_NO, sha256);
    await writeFile(filePath, input.file.contents);
    const version = await insertVersion(tx, {
      documentId: document.id,
      versionNo: FIRST_VERSION_NO,
      filePath,
      fileSha256: sha256,
    });
    await insertQueuedJob(tx, version.id);
    return {
      documentId: document.id,
      versionId: version.id,
      versionNo: version.versionNo,
      status: 'queued',
    };
  });
}

/**
 * Adds version N+1 with a queued job. The document row is locked so concurrent uploads get
 * consecutive version numbers. Newest wins: in-flight work on older versions is superseded.
 */
export async function createVersion(
  { db, storage }: ServiceDeps,
  documentId: string,
  file: PdfUpload,
): Promise<UploadAccepted> {
  const sha256 = sha256Hex(file.contents);
  return inTransactionWithFile(db, storage, async (tx, writeFile) => {
    const document = await lockDocument(tx, documentId, 'update');
    if (!document) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }
    const latest = await findLatestVersion(tx, documentId);
    if (latest?.fileSha256 === sha256) {
      throw new ConflictError(
        `File is identical to the current version (version ${latest.versionNo})`,
      );
    }

    await supersedeInFlightWork(tx, documentId);

    const versionNo = (latest?.versionNo ?? 0) + 1;
    const filePath = versionFileKey(documentId, versionNo, sha256);
    await writeFile(filePath, file.contents);
    const version = await insertVersion(tx, {
      documentId,
      versionNo,
      filePath,
      fileSha256: sha256,
    });
    await insertQueuedJob(tx, version.id);
    return { documentId, versionId: version.id, versionNo, status: 'queued' };
  });
}

/** Re-queues the current version when (and only when) its extraction failed. */
export async function retryVersion(
  { db }: ServiceDeps,
  documentId: string,
): Promise<{ versionId: string; status: 'queued' }> {
  const retryableStatus: VersionStatus = 'failed';
  try {
    return await db.transaction(async (tx) => {
      const document = await lockDocument(tx, documentId, 'update');
      if (!document) {
        throw new NotFoundError(`Document ${documentId} not found`);
      }
      const current = await findLatestVersion(tx, documentId);
      if (!current || current.status !== retryableStatus) {
        throw new ConflictError(
          `Only a failed version can be retried; version ${current?.versionNo ?? '?'} is ${current?.status ?? 'missing'}`,
        );
      }
      await requeueVersion(tx, current.id);
      await insertQueuedJob(tx, current.id);
      return { versionId: current.id, status: 'queued' as const };
    });
  } catch (error) {
    if (isUniqueViolation(error, 'extraction_jobs_one_open_per_version')) {
      throw new ConflictError('This version already has an open extraction job');
    }
    throw error;
  }
}

export function listDocuments({ db }: ServiceDeps): Promise<DocumentSummaryView[]> {
  return listDocumentSummaries(db);
}

async function resolveVersion(
  { db }: ServiceDeps,
  documentId: string,
  versionNo: number | undefined,
): Promise<{ document: DocumentRow; version: VersionRow; versions: VersionRow[] }> {
  const document = await findDocument(db, documentId);
  if (!document) {
    throw new NotFoundError(`Document ${documentId} not found`);
  }
  const versions = await listVersions(db, documentId);
  const version =
    versionNo === undefined ? versions.at(-1) : versions.find((v) => v.versionNo === versionNo);
  if (!version) {
    throw new NotFoundError(
      `Version ${versionNo ?? 'current'} of document ${documentId} not found`,
    );
  }
  return { document, version, versions };
}

/** The selected version (default: current) with its values, reviews and previous values. */
export async function getDocument(
  deps: ServiceDeps,
  documentId: string,
  versionNo: number | undefined,
): Promise<DocumentDetailView> {
  const { document, version, versions } = await resolveVersion(deps, documentId, versionNo);
  // Values and the selected version's text are independent reads.
  const [values, parsedText] = await Promise.all([
    listValueViews(deps.db, version.id),
    findVersionText(deps.db, version.id),
  ]);
  const currentVersionNo = versions.at(-1)?.versionNo ?? version.versionNo;
  return {
    document: { ...document, currentVersionNo },
    version: {
      ...version,
      baselineVersionNo:
        versions.find((candidate) => candidate.id === version.baselineVersionId)?.versionNo ?? null,
      parsedText,
    },
    versions,
    values: orderByFieldDefinitions(document.type, values),
  };
}

export async function getProgress(
  deps: ServiceDeps,
  documentId: string,
  versionNo: number | undefined,
): Promise<ReviewProgress> {
  const { version } = await resolveVersion(deps, documentId, versionNo);
  return getVersionProgress(deps.db, version.id);
}
