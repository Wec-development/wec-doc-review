import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { errorEnvelopeSchema, type ErrorCode } from '@doc-review/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { expect } from 'vitest';
import { type AppOptions, buildApp } from '../app.js';
import type { Database } from '../db/client.js';
import { type FileStorage, LocalDiskStorage } from '../storage/file-storage.js';

export interface TestApp {
  app: FastifyInstance;
  storageDir: string;
  /** Every file under the storage dir, as keys relative to it. */
  storedFiles: () => Promise<string[]>;
  close: () => Promise<void>;
}

/** Builds the app with a fresh temporary storage directory. */
export async function createTestApp(
  db: Database,
  input: { options?: Partial<AppOptions>; storage?: (dir: string) => FileStorage } = {},
): Promise<TestApp> {
  const storageDir = await mkdtemp(path.join(tmpdir(), 'doc-review-storage-'));
  const storage = input.storage?.(storageDir) ?? new LocalDiskStorage(storageDir);
  const app = buildApp({ db, storage, options: input.options });
  await app.ready();
  return {
    app,
    storageDir,
    storedFiles: async () =>
      (await readdir(storageDir, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(storageDir, path.join(entry.parentPath, entry.name))),
    close: async () => {
      await app.close();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}

/** A tiny but valid-looking PDF; distinct labels give distinct bytes (and SHA-256s). */
export function pdfBytes(label: string = randomUUID(), padToBytes = 0): Buffer {
  const body = Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF\n`, 'ascii');
  return padToBytes > body.length
    ? Buffer.concat([body, Buffer.alloc(padToBytes - body.length, 0x20)])
    : body;
}

interface FilePart {
  contents: Buffer;
  filename?: string;
  contentType?: string;
}

/** Encodes a multipart/form-data body for app.inject(). */
export function multipart(
  fields: Record<string, string>,
  file?: FilePart,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----doc-review-test-${randomUUID()}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename ?? 'upload.pdf'}"\r\n` +
          `Content-Type: ${file.contentType ?? 'application/pdf'}\r\n\r\n`,
      ),
      file.contents,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

export function uploadDocument(
  app: FastifyInstance,
  input: { type?: string; title?: string; file?: FilePart } = {},
) {
  const fields: Record<string, string> = {};
  if (input.type !== undefined) fields.type = input.type;
  if (input.title !== undefined) fields.title = input.title;
  const body = multipart(fields, input.file ?? { contents: pdfBytes() });
  return app.inject({ method: 'POST', url: '/documents', ...body });
}

export function uploadVersion(app: FastifyInstance, documentId: string, file?: FilePart) {
  const body = multipart({}, file ?? { contents: pdfBytes() });
  return app.inject({ method: 'POST', url: `/documents/${documentId}/versions`, ...body });
}

/** Asserts the status and that the body is the standard error envelope with this code. */
export function expectError(response: LightMyRequestResponse, status: number, code: ErrorCode) {
  expect(response.statusCode).toBe(status);
  const envelope = errorEnvelopeSchema.parse(response.json());
  expect(envelope.error.code).toBe(code);
  return envelope.error;
}
