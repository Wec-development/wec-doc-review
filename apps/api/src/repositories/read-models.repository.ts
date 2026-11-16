import type {
  DocumentType,
  ReviewAction,
  ReviewProgress,
  ReviewState,
  VersionStatus,
} from '@doc-review/shared';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Executor } from '../db/client.js';
import { documents, documentVersions, extractedValues, valueReviewStates } from '../db/schema.js';

export interface ReviewView {
  action: ReviewAction;
  correctedValue: string | null;
  note: string | null;
  reviewer: string;
  createdAt: Date;
}

export interface ValueView {
  id: string;
  field: string;
  value: string | null;
  normalizedValue: string | null;
  evidence: string | null;
  evidenceStart: number | null;
  evidenceEnd: number | null;
  gapReason: string | null;
  carriedOver: boolean;
  reviewState: ReviewState;
  latestReview: ReviewView | null;
  previous: {
    value: string | null;
    evidence: string | null;
    latestReview: ReviewView | null;
  } | null;
}

export interface DocumentSummaryView {
  id: string;
  type: DocumentType;
  title: string;
  currentVersionNo: number;
  status: VersionStatus;
  progress: ReviewProgress;
  updatedAt: Date;
}

function countValuesWhere(condition: SQL): SQL<number> {
  return sql<number>`count(${valueReviewStates.valueId}) filter (where ${condition})`.mapWith(
    Number,
  );
}

/**
 * Progress counts over value_review_states rows. Shared by the list and the progress endpoint so
 * both count the same way; gaps are counted in addition to their review state.
 */
const progressColumns = {
  pending: countValuesWhere(sql`${valueReviewStates.reviewState} = 'pending'`),
  approved: countValuesWhere(sql`${valueReviewStates.reviewState} = 'approved'`),
  corrected: countValuesWhere(sql`${valueReviewStates.reviewState} = 'corrected'`),
  carriedOver: countValuesWhere(sql`${valueReviewStates.reviewState} = 'carried_over'`),
  gaps: countValuesWhere(sql`${valueReviewStates.isGap}`),
  total: sql<number>`count(${valueReviewStates.valueId})`.mapWith(Number),
};

export async function getVersionProgress(db: Executor, versionId: string): Promise<ReviewProgress> {
  const [row] = await db
    .select(progressColumns)
    .from(valueReviewStates)
    .where(eq(valueReviewStates.versionId, versionId));
  return row ?? { pending: 0, approved: 0, corrected: 0, carriedOver: 0, gaps: 0, total: 0 };
}

/** All documents with their current version and its progress, in one aggregate query. */
export async function listDocumentSummaries(db: Executor): Promise<DocumentSummaryView[]> {
  const latestVersionNo = sql`(
    select max(latest.version_no) from ${documentVersions} latest
    where latest.document_id = ${documents.id}
  )`;
  // A document changes when its current version changes (upload, status) or is reviewed.
  const updatedAt = sql<Date>`greatest(${documentVersions.updatedAt}, max(${valueReviewStates.reviewedAt}))`;

  const rows = await db
    .select({
      id: documents.id,
      type: documents.type,
      title: documents.title,
      currentVersionNo: documentVersions.versionNo,
      status: documentVersions.status,
      updatedAt: updatedAt.mapWith(documentVersions.updatedAt),
      ...progressColumns,
    })
    .from(documents)
    .innerJoin(
      documentVersions,
      and(
        eq(documentVersions.documentId, documents.id),
        eq(documentVersions.versionNo, latestVersionNo),
      ),
    )
    .leftJoin(valueReviewStates, eq(valueReviewStates.versionId, documentVersions.id))
    .groupBy(documents.id, documentVersions.id)
    .orderBy(desc(updatedAt), desc(documents.createdAt));

  return rows.map(({ pending, approved, corrected, carriedOver, gaps, total, ...document }) => ({
    ...document,
    progress: { pending, approved, corrected, carriedOver, gaps, total },
  }));
}

const previousValue = alias(extractedValues, 'previous_value');
const previousState = alias(valueReviewStates, 'previous_state');

interface ReviewColumns {
  reviewAction: ReviewAction | null;
  correctedValue: string | null;
  note: string | null;
  reviewer: string | null;
  reviewedAt: Date | null;
}

function toReviewView(columns: ReviewColumns): ReviewView | null {
  if (columns.reviewAction === null || columns.reviewedAt === null) {
    return null;
  }
  return {
    action: columns.reviewAction,
    correctedValue: columns.correctedValue,
    note: columns.note,
    reviewer: columns.reviewer ?? 'reviewer',
    createdAt: columns.reviewedAt,
  };
}

async function selectValueViews(db: Executor, where: SQL | undefined): Promise<ValueView[]> {
  const rows = await db
    .select({
      id: extractedValues.id,
      field: extractedValues.field,
      value: extractedValues.value,
      normalizedValue: extractedValues.normalizedValue,
      evidence: extractedValues.evidence,
      evidenceStart: extractedValues.evidenceStart,
      evidenceEnd: extractedValues.evidenceEnd,
      gapReason: extractedValues.gapReason,
      carriedOver: extractedValues.carriedOver,
      reviewState: valueReviewStates.reviewState,
      reviewAction: valueReviewStates.reviewAction,
      correctedValue: valueReviewStates.correctedValue,
      note: valueReviewStates.note,
      reviewer: valueReviewStates.reviewer,
      reviewedAt: valueReviewStates.reviewedAt,
      previousId: previousValue.id,
      previousValue: previousValue.value,
      previousEvidence: previousValue.evidence,
      previousReviewAction: previousState.reviewAction,
      previousCorrectedValue: previousState.correctedValue,
      previousNote: previousState.note,
      previousReviewer: previousState.reviewer,
      previousReviewedAt: previousState.reviewedAt,
    })
    .from(extractedValues)
    .innerJoin(valueReviewStates, eq(valueReviewStates.valueId, extractedValues.id))
    .leftJoin(previousValue, eq(previousValue.id, extractedValues.previousValueId))
    .leftJoin(previousState, eq(previousState.valueId, previousValue.id))
    .where(where);

  return rows.map((row) => ({
    id: row.id,
    field: row.field,
    value: row.value,
    normalizedValue: row.normalizedValue,
    evidence: row.evidence,
    evidenceStart: row.evidenceStart,
    evidenceEnd: row.evidenceEnd,
    gapReason: row.gapReason,
    carriedOver: row.carriedOver,
    reviewState: row.reviewState,
    latestReview: toReviewView(row),
    previous:
      row.previousId === null
        ? null
        : {
            value: row.previousValue,
            evidence: row.previousEvidence,
            latestReview: toReviewView({
              reviewAction: row.previousReviewAction,
              correctedValue: row.previousCorrectedValue,
              note: row.previousNote,
              reviewer: row.previousReviewer,
              reviewedAt: row.previousReviewedAt,
            }),
          },
  }));
}

export function listValueViews(db: Executor, versionId: string): Promise<ValueView[]> {
  return selectValueViews(db, eq(extractedValues.versionId, versionId));
}

export async function findValueView(db: Executor, valueId: string): Promise<ValueView | undefined> {
  const [view] = await selectValueViews(db, eq(extractedValues.id, valueId));
  return view;
}
