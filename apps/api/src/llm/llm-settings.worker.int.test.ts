import { readFileSync } from 'node:fs';
import { type LlmProvider, uploadAcceptedSchema } from '@doc-review/shared';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encryptSecret } from '../crypto/secret-box.js';
import { documentVersions, extractionJobs } from '../db/schema.js';
import { LlmExtractor } from '../extraction/llm-extractor.js';
import { AUTH_FAILED_MESSAGE } from '../extraction/llm/llm-client.js';
import { createFileResolver } from '../extraction/resolve-file.js';
import { upsertLlmSettings } from '../repositories/llm-settings.repository.js';
import { LocalDiskStorage } from '../storage/file-storage.js';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../test/db.js';
import { createTestApp, TEST_ENCRYPTION_KEY, type TestApp, uploadDocument } from '../test/http.js';
import {
  FIXTURES_DIR,
  jsonResponse,
  loadRecording,
  openAiRecording,
  type RecordedCall,
  replayFetch,
} from '../test/llm.js';
import { makeTestWorker } from '../test/worker.js';
import { LlmSettingsResolver } from './settings-resolver.js';

/**
 * The worker reads provider, model and key from the saved settings for every job: paused while
 * nothing is saved, switching provider without a restart, failing readably on a revoked key.
 */

const INVOICE = readFileSync(`${FIXTURES_DIR}documents/invoice-001.pdf`);
const ANTHROPIC_KEY = 'sk-ant-api03-worker-test-key-0001-WXYZ';
const OPENAI_KEY = 'sk-proj-worker-test-key-0002-a1b2';
const REVOKED_KEY = 'sk-ant-api03-revoked-worker-key-00-DEAD';

let testDb: TestDatabase;
let testApp: TestApp;
let calls: RecordedCall[];

beforeAll(() => {
  testDb = connectTestDatabase();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await resetDatabase(testDb.db);
  testApp = await createTestApp(testDb.db);
});
afterEach(() => testApp.close());

function sentKey(call: RecordedCall): string {
  return (call.headers.get('x-api-key') ?? call.headers.get('authorization') ?? '').replace(
    /^Bearer /,
    '',
  );
}

/** Answers like each provider would: 401 for the revoked key, else the recorded reply. */
function providerReplay() {
  return replayFetch((call) => {
    if (sentKey(call) === REVOKED_KEY) {
      return jsonResponse(401, {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      });
    }
    return call.url.includes('openai')
      ? jsonResponse(200, openAiRecording('invoice-001', { id: 'chatcmpl_settings' }))
      : jsonResponse(200, loadRecording('invoice-001'));
  });
}

/** Saves settings the way PUT /settings/llm does (encrypted with the app's key). */
async function configure(provider: LlmProvider, model: string, apiKey: string) {
  const encrypted = encryptSecret(apiKey, TEST_ENCRYPTION_KEY);
  await upsertLlmSettings(testDb.db, {
    provider,
    model,
    apiKeyCiphertext: encrypted.ciphertext,
    apiKeyIv: encrypted.iv,
    apiKeyTag: encrypted.tag,
    keyVersion: encrypted.keyVersion,
    keyHint: apiKey.slice(-4),
  });
}

/** The production wiring: resolver-gated claims and a client resolved per job. */
function settingsWorker() {
  const replay = providerReplay();
  calls = replay.calls;
  const resolver = new LlmSettingsResolver({
    db: testDb.db,
    encryptionKey: TEST_ENCRYPTION_KEY,
    timeoutMs: 5000,
    cacheMs: 0,
    fetch: replay.fetch,
  });
  const worker = makeTestWorker(testDb.db, {
    extractor: new LlmExtractor({
      llm: () => resolver.clientForJob(),
      resolveFile: createFileResolver(new LocalDiskStorage(testApp.storageDir), FIXTURES_DIR),
      maxDocumentChars: 100_000,
    }),
    settings: { maxAttempts: 3 },
    canClaim: () => resolver.isConfigured(),
  });
  return worker;
}

async function uploadInvoice() {
  const response = await uploadDocument(testApp.app, {
    type: 'invoice',
    file: { contents: INVOICE },
  });
  return uploadAcceptedSchema.parse(response.json());
}

async function jobOf(versionId: string) {
  const rows = await testDb.db
    .select()
    .from(extractionJobs)
    .where(eq(extractionJobs.versionId, versionId))
    .orderBy(extractionJobs.createdAt);
  return rows.at(-1);
}

async function versionOf(versionId: string) {
  const [row] = await testDb.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.id, versionId));
  return row;
}

describe('worker with LLM settings from the database', () => {
  it('does not claim anything while no LLM is configured, using no attempts', async () => {
    const { versionId } = await uploadInvoice();
    const worker = settingsWorker();

    expect(await worker.runOnce()).toBeNull();
    expect(await worker.runOnce()).toBeNull();

    expect(await jobOf(versionId)).toMatchObject({ status: 'queued', attempts: 0, lockedBy: null });
    expect(await versionOf(versionId)).toMatchObject({ status: 'queued' });
    expect(calls).toHaveLength(0);
  });

  it('extracts with the saved provider, model and key, and records them on the job', async () => {
    await configure('anthropic', 'claude-haiku-5-5', ANTHROPIC_KEY);
    const { versionId } = await uploadInvoice();

    expect(await settingsWorker().runOnce()).toBe('done');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toMatch(/api\.anthropic\.com\/v1\/messages/);
    expect(calls[0]?.body.model).toBe('claude-haiku-5-5');
    expect(sentKey(calls[0] as RecordedCall)).toBe(ANTHROPIC_KEY);
    const job = await jobOf(versionId);
    expect(job).toMatchObject({
      status: 'done',
      provider: 'anthropic',
      promptVersion: 'extract-v1',
    });
    expect(JSON.stringify(job)).not.toContain(ANTHROPIC_KEY);
  });

  it('switches provider for the next job without a restart', async () => {
    await configure('anthropic', 'claude-haiku-5-5', ANTHROPIC_KEY);
    const worker = settingsWorker();
    const first = await uploadInvoice();
    expect(await worker.runOnce()).toBe('done');

    await configure('openai', 'gpt-6-luna', OPENAI_KEY);
    const second = await uploadInvoice();
    expect(await worker.runOnce()).toBe('done');

    expect(calls.map((call) => [new URL(call.url).host, call.body.model])).toEqual([
      ['api.anthropic.com', 'claude-haiku-5-5'],
      ['api.openai.com', 'gpt-6-luna'],
    ]);
    expect(sentKey(calls[1] as RecordedCall)).toBe(OPENAI_KEY);
    expect((await jobOf(first.versionId))?.provider).toBe('anthropic');
    expect(await jobOf(second.versionId)).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o-mini-2024-07-18',
    });
  });

  it('fails a revoked key with the Settings message; retry works once the key is replaced', async () => {
    await configure('anthropic', 'claude-haiku-5-5', REVOKED_KEY);
    const { documentId, versionId } = await uploadInvoice();
    const worker = settingsWorker();

    expect(await worker.runOnce()).toBe('failed');
    expect(await versionOf(versionId)).toMatchObject({
      status: 'failed',
      error: `Extraction failed: ${AUTH_FAILED_MESSAGE}`,
    });
    expect(await jobOf(versionId)).toMatchObject({ status: 'failed', attempts: 1 });

    await configure('anthropic', 'claude-haiku-5-5', ANTHROPIC_KEY);
    const retry = await testApp.app.inject({
      method: 'POST',
      url: `/documents/${documentId}/retry`,
    });
    expect(retry.statusCode).toBe(202);
    expect(await worker.runOnce()).toBe('done');
    expect(await versionOf(versionId)).toMatchObject({ status: 'extracted', error: null });
  });

  it('fails readably when the stored key cannot be decrypted (encryption key changed)', async () => {
    await configure('anthropic', 'claude-haiku-5-5', ANTHROPIC_KEY);
    const { versionId } = await uploadInvoice();
    const resolver = new LlmSettingsResolver({
      db: testDb.db,
      encryptionKey: Buffer.alloc(32, 9),
      timeoutMs: 5000,
    });
    const worker = makeTestWorker(testDb.db, {
      extractor: new LlmExtractor({
        llm: () => resolver.clientForJob(),
        resolveFile: createFileResolver(new LocalDiskStorage(testApp.storageDir), FIXTURES_DIR),
        maxDocumentChars: 100_000,
      }),
    });

    expect(await worker.runOnce()).toBe('failed');
    expect((await versionOf(versionId))?.error).toMatch(
      /cannot be decrypted.*enter it again in Settings/,
    );
  });
});
