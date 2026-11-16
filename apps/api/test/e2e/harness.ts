import { readFileSync } from 'node:fs';
import {
  type DocumentDetail,
  documentDetailSchema,
  documentListSchema,
  type ReviewProgress,
  reviewProgressSchema,
  uploadAcceptedSchema,
  type VersionStatus,
} from '@doc-review/shared';
import { expect } from 'vitest';
import { readFixtureManifest, seedFixtures } from '../../src/db/seed.js';
import type { TestDatabase } from '../../src/test/db.js';
import type { TestApp } from '../../src/test/http.js';
import { uploadDocument, uploadVersion } from '../../src/test/http.js';
import {
  FIXTURES_DIR,
  jsonResponse,
  loadRecording,
  promptOf,
  type RecordedCall,
  uploadsExtractor,
} from '../../src/test/llm.js';
import { waitFor } from '../../src/test/wait.js';
import { silentLogger } from '../../src/test/worker.js';
import { Worker } from '../../src/worker/worker.js';

/**
 * End-to-end harness: the real app over HTTP (inject), a real background Worker polling the
 * real Postgres, real PDF parsing of what the API stored, and the real Anthropic SDK client
 * answered by recorded replies. Nothing touches the network.
 */

export const INVOICE_V1 = readFileSync(`${FIXTURES_DIR}documents/invoice-001.pdf`);
export const INVOICE_V2 = readFileSync(`${FIXTURES_DIR}documents/invoice-001.v2.pdf`);
const REVISED_MARKER = 'INVOICE (REVISED)';

/** Waits are bounded; a scenario that stalls fails with a description instead of hanging. */
export const WAIT_MS = 10_000;

/** Recorded reply bodies, by document; any can be swapped for a variant per scenario. */
export interface Replies {
  invoice: unknown;
  revisedInvoice: unknown;
  lease: unknown;
  marketReport: unknown;
}

export function recordedReplies(overrides: Partial<Replies> = {}): Replies {
  return {
    invoice: loadRecording('invoice-001'),
    revisedInvoice: loadRecording('invoice-001.v2'),
    lease: loadRecording('lease-excerpt-001'),
    marketReport: loadRecording('market-report-excerpt-001'),
    ...overrides,
  };
}

/** Picks the reply for the document in the prompt (revised invoice text first). */
export function answerFrom(replies: Replies) {
  return (call: RecordedCall): Response => {
    const prompt = promptOf(call);
    if (prompt.includes(REVISED_MARKER)) return jsonResponse(200, replies.revisedInvoice);
    const type = prompt.match(/^Document type: (.+)$/m)?.[1];
    if (type === 'invoice') return jsonResponse(200, replies.invoice);
    if (type === 'lease') return jsonResponse(200, replies.lease);
    if (type === 'market report') return jsonResponse(200, replies.marketReport);
    return jsonResponse(500, { type: 'error', error: { type: 'api_error', message: 'no reply' } });
  };
}

export const isRevisedInvoice = (call: RecordedCall) => promptOf(call).includes(REVISED_MARKER);

/** Starts a background worker with the production extraction pipeline and recorded replies. */
export function startWorker(
  testDb: TestDatabase,
  testApp: TestApp,
  respond: (call: RecordedCall, index: number) => Response,
  options: {
    workerId?: string;
    delayMs?: (call: RecordedCall) => number;
    /** The claim gate (production: "is an LLM configured in Settings?"). */
    canClaim?: () => Promise<boolean>;
  } = {},
) {
  const { extractor, calls } = uploadsExtractor(testApp.storageDir, respond, {
    delayMs: options.delayMs,
  });
  const worker = new Worker(
    {
      db: testDb.db,
      extractor,
      logger: silentLogger,
      workerId: options.workerId ?? 'e2e-worker',
      settings: { leaseSeconds: 5, maxAttempts: 3, backoffBaseMs: 0 },
    },
    {
      concurrency: 2,
      pollIntervalMs: 25,
      ...(options.canClaim ? { canClaim: options.canClaim } : {}),
    },
  );
  worker.start();
  return { worker, calls };
}

export async function seed(testDb: TestDatabase): Promise<void> {
  const manifest = await readFixtureManifest(FIXTURES_DIR);
  await testDb.db.transaction((tx) => seedFixtures(tx, manifest));
}

/** A small API client over app.inject, parsing every response with the shared schemas. */
export function api(testApp: TestApp) {
  const { app } = testApp;
  return {
    async list() {
      const response = await app.inject('/documents');
      expect(response.statusCode).toBe(200);
      return documentListSchema.parse(response.json()).documents;
    },
    async detail(documentId: string, versionNo?: number): Promise<DocumentDetail> {
      const query = versionNo === undefined ? '' : `?version=${versionNo}`;
      const response = await app.inject(`/documents/${documentId}${query}`);
      expect(response.statusCode).toBe(200);
      return documentDetailSchema.parse(response.json());
    },
    async progress(documentId: string): Promise<ReviewProgress> {
      const response = await app.inject(`/documents/${documentId}/progress`);
      expect(response.statusCode).toBe(200);
      return reviewProgressSchema.parse(response.json());
    },
    async upload(contents: Buffer, type = 'invoice') {
      const response = await uploadDocument(app, { type, title: 'E2E upload', file: { contents } });
      expect(response.statusCode).toBe(202);
      return uploadAcceptedSchema.parse(response.json());
    },
    async uploadVersion(documentId: string, contents: Buffer) {
      const response = await uploadVersion(app, documentId, { contents });
      expect(response.statusCode).toBe(202);
      return uploadAcceptedSchema.parse(response.json());
    },
    review(valueId: string, body: object) {
      return app.inject({ method: 'POST', url: `/values/${valueId}/review`, payload: body });
    },
    retry(documentId: string) {
      return app.inject({ method: 'POST', url: `/documents/${documentId}/retry` });
    },
  };
}

export type Api = ReturnType<typeof api>;

/** Waits until version `versionNo` of the document reaches `status`, as the API reports it. */
export async function waitForVersion(
  client: Api,
  documentId: string,
  versionNo: number,
  status: VersionStatus,
): Promise<DocumentDetail> {
  await waitFor(
    async () => (await client.detail(documentId, versionNo)).version.status === status,
    {
      timeoutMs: WAIT_MS,
      description: `v${versionNo} of ${documentId} to be ${status}`,
    },
  );
  return client.detail(documentId, versionNo);
}

export const byField = (detail: DocumentDetail) =>
  new Map(detail.values.map((value) => [value.field, value]));
