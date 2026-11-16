import { documentDetailSchema, uploadAcceptedSchema } from '@doc-review/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { documentVersions, extractedValues, extractionJobs } from '../db/schema.js';
import { readFixtureManifest, seedFixtures } from '../db/seed.js';
import { LocalDiskStorage } from '../storage/file-storage.js';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../test/db.js';
import { createTestApp, uploadDocument } from '../test/http.js';
import {
  blankPdf,
  FIXTURES_DIR,
  jsonResponse,
  loadRecording,
  recordedLlmExtractor,
  replayFetch,
  respondByDocumentType,
  TEST_API_KEY,
  TEST_MODEL,
} from '../test/llm.js';
import { createLogger } from '../worker/logger.js';
import { Worker } from '../worker/worker.js';
import type { Extractor } from './extractor.js';
import { LlmExtractor } from './llm-extractor.js';
import { AnthropicLlmClient } from './llm/anthropic-client.js';
import { NO_TEXT_REASON, parsePdfFile } from './pdf/parse-pdf.js';
import { PROMPT_VERSION } from './prompt/build-prompt.js';
import { createFileResolver } from './resolve-file.js';

let testDb: TestDatabase;

beforeAll(() => {
  testDb = connectTestDatabase();
});
afterAll(() => testDb.close());
beforeEach(() => resetDatabase(testDb.db));

const RECORDINGS = {
  invoice: 'invoice-001',
  lease: 'lease-excerpt-001',
  'market report': 'market-report-excerpt-001',
};

function worker(extractor: Extractor) {
  return new Worker(
    {
      db: testDb.db,
      extractor,
      logger: createLogger({}, () => undefined),
      workerId: 'worker-llm',
      settings: { leaseSeconds: 30, maxAttempts: 3, backoffBaseMs: 0 },
    },
    { concurrency: 1, pollIntervalMs: 20 },
  );
}

async function seed() {
  const manifest = await readFixtureManifest(FIXTURES_DIR);
  await testDb.db.transaction((tx) => seedFixtures(tx, manifest));
}

async function versionByFile(fileSuffix: string) {
  const rows = await testDb.db.select().from(documentVersions);
  const version = rows.find((row) => row.filePath.endsWith(fileSuffix));
  if (!version) throw new Error(`no version for ${fileSuffix}`);
  return version;
}

async function jobOf(versionId: string) {
  const [job] = await testDb.db
    .select()
    .from(extractionJobs)
    .where(eq(extractionJobs.versionId, versionId))
    .orderBy(sql`${extractionJobs.createdAt} desc`)
    .limit(1);
  if (!job) throw new Error(`no job for ${versionId}`);
  return job;
}

describe('LLM extraction through the worker', () => {
  it('runs the seeded jobs end to end: parsed text, values and gaps, prompt, raw response, usage', async () => {
    await seed();
    const { fetch } = replayFetch(respondByDocumentType(RECORDINGS));
    const llmWorker = worker(recordedLlmExtractor(fetch));

    const outcomes = [
      await llmWorker.runOnce(),
      await llmWorker.runOnce(),
      await llmWorker.runOnce(),
    ];
    expect(outcomes).toEqual(['done', 'done', 'done']);
    expect(await llmWorker.runOnce()).toBeNull();

    const report = await versionByFile('market-report-excerpt-001.pdf');
    expect(report.status).toBe('extracted');
    expect(report.parsedText).toBe(
      await parsePdfFile(`${FIXTURES_DIR}documents/market-report-excerpt-001.pdf`, 100_000),
    );
    const values = await testDb.db
      .select()
      .from(extractedValues)
      .where(eq(extractedValues.versionId, report.id));
    expect(values).toHaveLength(6);
    expect(values.find((v) => v.field === 'median_household_income')).toMatchObject({
      value: null,
      gapReason: expect.any(String),
    });
    expect(values.find((v) => v.field === 'vacancy_rate')).toMatchObject({
      value: '4.2%',
      normalizedValue: '4.2',
    });

    expect(await jobOf(report.id)).toMatchObject({
      status: 'done',
      promptVersion: PROMPT_VERSION,
      model: TEST_MODEL,
      prompt: expect.stringContaining('Fields to extract:'),
      rawResponse: expect.objectContaining({ id: 'msg_rec_report_001' }),
      usage: { inputTokens: 1104, outputTokens: 612 },
      llmDurationMs: expect.any(Number),
    });
  });

  it('exposes evidence and its offsets through GET /documents/:id', async () => {
    await seed();
    const { fetch } = replayFetch(respondByDocumentType(RECORDINGS));
    const llmWorker = worker(recordedLlmExtractor(fetch));
    while ((await llmWorker.runOnce()) !== null) {
      // drain the queue
    }
    const invoice = await versionByFile('invoice-001.pdf');
    const testApp = await createTestApp(testDb.db);
    try {
      const response = await testApp.app.inject(`/documents/${invoice.documentId}`);
      const detail = documentDetailSchema.parse(response.json());
      const total = detail.values.find((v) => v.field === 'total_amount');
      expect(total).toMatchObject({
        value: '$5,230.29',
        normalizedValue: '5230.29 USD',
        evidence: 'Total Due: $5,230.29',
      });
      expect(invoice.parsedText?.slice(total?.evidenceStart ?? 0, total?.evidenceEnd ?? 0)).toBe(
        total?.evidence,
      );
    } finally {
      await testApp.close();
    }
  });

  it('retries after an LLM 429 and keeps the prompt of the failed attempt on the job', async () => {
    await seed();
    const respond = respondByDocumentType(RECORDINGS);
    const { fetch, calls } = replayFetch((call, index) =>
      index === 0
        ? jsonResponse(429, {
            type: 'error',
            error: { type: 'rate_limit_error', message: 'slow down' },
          })
        : respond(call),
    );
    const llmWorker = worker(recordedLlmExtractor(fetch));

    expect(await llmWorker.runOnce()).toBe('retry');
    const firstVersionId = (await testDb.db.select().from(extractionJobs)).find(
      (job) => job.status === 'queued' && job.attempts === 1,
    )?.versionId;
    if (!firstVersionId) throw new Error('expected a re-queued job');
    expect(await jobOf(firstVersionId)).toMatchObject({
      status: 'queued',
      lastError: 'LLM rate limit reached (429)',
      promptVersion: PROMPT_VERSION,
      prompt: expect.stringContaining('<document>'),
      rawResponse: null,
    });

    while ((await llmWorker.runOnce()) !== null) {
      // drain, including the retried job
    }
    expect(await jobOf(firstVersionId)).toMatchObject({ status: 'done', attempts: 2 });
    expect(calls).toHaveLength(4);
  });

  it('fails immediately with a readable error on an auth failure, never storing the key', async () => {
    await seed();
    const { fetch } = replayFetch(() =>
      jsonResponse(401, {
        type: 'error',
        error: { type: 'authentication_error', message: `invalid x-api-key ${TEST_API_KEY}` },
      }),
    );
    expect(await worker(recordedLlmExtractor(fetch)).runOnce()).toBe('failed');

    const failed = (await testDb.db.select().from(documentVersions)).find(
      (v) => v.status === 'failed',
    );
    expect(failed?.error).toBe('Extraction failed: LLM authentication failed — check LLM_API_KEY');
    const job = await jobOf(failed?.id ?? '');
    expect(job).toMatchObject({ status: 'failed', attempts: 1 });
    expect(JSON.stringify(job)).not.toContain(TEST_API_KEY);
  });

  it('fails an uploaded scanned (image-only) PDF permanently with a clear reason', async () => {
    const testApp = await createTestApp(testDb.db);
    try {
      const upload = await uploadDocument(testApp.app, {
        type: 'invoice',
        file: { contents: Buffer.from(blankPdf()) },
      });
      const { versionId } = uploadAcceptedSchema.parse(upload.json());
      const { fetch, calls } = replayFetch(() => jsonResponse(500, {}));
      const extractor = new LlmExtractor({
        llm: new AnthropicLlmClient({
          apiKey: TEST_API_KEY,
          model: TEST_MODEL,
          timeoutMs: 1000,
          fetch,
        }),
        resolveFile: createFileResolver(new LocalDiskStorage(testApp.storageDir), FIXTURES_DIR),
        maxDocumentChars: 100_000,
      });

      expect(await worker(extractor).runOnce()).toBe('failed');
      const [version] = await testDb.db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, versionId));
      expect(version?.error).toBe(`Extraction failed: ${NO_TEXT_REASON}`);
      expect(calls).toHaveLength(0);
    } finally {
      await testApp.close();
    }
  });

  it('stores the raw response of malformed output and fails after the last attempt', async () => {
    await seed();
    const garbled = {
      ...(loadRecording('invoice-001') as Record<string, unknown>),
      content: [{ type: 'text', text: 'I could not produce JSON' }],
    };
    const { fetch } = replayFetch(() => jsonResponse(200, garbled));
    const llmWorker = worker(recordedLlmExtractor(fetch));

    // The three seeded jobs share a created_at, so drain the queue rather than assume an order.
    const outcomes: (string | null)[] = [];
    for (let run = 0; run < 10; run += 1) {
      outcomes.push(await llmWorker.runOnce());
    }
    expect(outcomes.filter((o) => o === 'retry')).toHaveLength(6);
    expect(outcomes.filter((o) => o === 'failed')).toHaveLength(3);
    const jobs = await testDb.db.select().from(extractionJobs);
    expect(jobs.every((j) => j.status === 'failed' && j.attempts === 3)).toBe(true);
    const failed = jobs[0];
    expect(failed).toMatchObject({
      attempts: 3,
      lastError: 'Model output was not valid JSON',
      rawResponse: expect.objectContaining({ id: 'msg_rec_invoice_001' }),
      usage: { inputTokens: 912, outputTokens: 486 },
    });
  });
});
