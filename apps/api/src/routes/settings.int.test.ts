import { Writable } from 'node:stream';
import { errorEnvelopeSchema, llmSettingsSchema, llmTestResultSchema } from '@doc-review/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REDACTED_LOG_PATHS } from '../app.js';
import { llmSettings } from '../db/schema.js';
import { listAvailableModels } from '../llm/modelCatalog.js';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../test/db.js';
import { createTestApp, type TestApp } from '../test/http.js';
import { jsonResponse, type RecordedCall, replayFetch } from '../test/llm.js';
import { ANTHROPIC_MODELS, OPENAI_MODELS } from '../test/models.js';

const ANTHROPIC_KEY = 'sk-ant-api03-settings-test-key-0001-WXYZ';
const OTHER_ANTHROPIC_KEY = 'sk-ant-api03-settings-test-key-0002-ABCD';
const OPENAI_KEY = 'sk-proj-settings-test-key-0003-a1b2';
const REVOKED_KEY = 'sk-ant-api03-revoked-key-0000000-DEAD';
const ALL_KEYS = [ANTHROPIC_KEY, OTHER_ANTHROPIC_KEY, OPENAI_KEY, REVOKED_KEY];

let testDb: TestDatabase;
let testApp: TestApp;
let calls: RecordedCall[];
let logLines: string[];

/** The key a replayed list-models request carried (x-api-key or bearer token). */
function keyOf(call: RecordedCall): string {
  return (call.headers.get('x-api-key') ?? call.headers.get('authorization') ?? '').replace(
    /^Bearer /,
    '',
  );
}

/** Answers list-models like the providers do: 401 for a revoked key, else the model list. */
function providerFetch() {
  return replayFetch((call) => {
    if (keyOf(call) === REVOKED_KEY) {
      return jsonResponse(401, {
        type: 'error',
        error: { type: 'authentication_error', message: `invalid x-api-key ${REVOKED_KEY}` },
      });
    }
    return jsonResponse(200, call.url.includes('anthropic') ? ANTHROPIC_MODELS : OPENAI_MODELS);
  });
}

async function startApp(fetch: typeof globalThis.fetch, timeoutMs?: number) {
  const capture = new Writable({
    write(chunk: Buffer, _encoding, done) {
      logLines.push(chunk.toString());
      done();
    },
  });
  testApp = await createTestApp(testDb.db, {
    listModels: (provider, apiKey) => listAvailableModels(provider, apiKey, { fetch, timeoutMs }),
    logger: { level: 'trace', stream: capture, redact: REDACTED_LOG_PATHS },
  });
}

beforeAll(() => {
  testDb = connectTestDatabase();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await resetDatabase(testDb.db);
  logLines = [];
  const replay = providerFetch();
  calls = replay.calls;
  await startApp(replay.fetch);
});
afterEach(() => testApp.close());

function getSettings() {
  return testApp.app.inject({ method: 'GET', url: '/settings/llm' });
}

function testConnection(body: object) {
  return testApp.app.inject({ method: 'POST', url: '/settings/llm/test', payload: body });
}

function save(body: object) {
  return testApp.app.inject({ method: 'PUT', url: '/settings/llm', payload: body });
}

function expectEnvelope(
  response: Awaited<ReturnType<typeof getSettings>>,
  status: number,
  code: string,
  message?: string | RegExp,
) {
  expect(response.statusCode).toBe(status);
  const error = errorEnvelopeSchema.parse(response.json()).error;
  expect(error.code).toBe(code);
  if (message !== undefined) expect(error.message).toMatch(message);
}

async function storedRow() {
  const [row] = await testDb.db.select().from(llmSettings);
  return row;
}

describe('GET /settings/llm', () => {
  it('reports "not configured" before anything is saved', async () => {
    const response = await getSettings();
    expect(response.statusCode).toBe(200);
    expect(llmSettingsSchema.parse(response.json())).toEqual({
      configured: false,
      provider: null,
      model: null,
      keyHint: null,
      lastVerifiedAt: null,
      updatedAt: null,
    });
  });

  it('shows provider, model and the last 4 characters after saving, never the key', async () => {
    expect(
      (await save({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: ANTHROPIC_KEY }))
        .statusCode,
    ).toBe(200);

    const response = await getSettings();

    expect(llmSettingsSchema.parse(response.json())).toMatchObject({
      configured: true,
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      keyHint: 'WXYZ',
      lastVerifiedAt: expect.any(String),
    });
    expect(response.body).not.toContain(ANTHROPIC_KEY);
    expect(response.body).not.toContain('settings-test-key');
  });
});

describe('POST /settings/llm/test', () => {
  it('verifies the key with the free list-models call and returns the usable models', async () => {
    const response = await testConnection({ provider: 'anthropic', apiKey: ANTHROPIC_KEY });

    expect(response.statusCode).toBe(200);
    const result = llmTestResultSchema.parse(response.json());
    expect(result.models[0]).toEqual({
      id: 'claude-haiku-5-5',
      label: 'Recommended — low cost',
      recommended: true,
    });
    expect(result.models.map((m) => m.id)).not.toContain('claude-haiku-4-5');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toMatch(/\/v1\/models/);
    expect(response.body).not.toContain(ANTHROPIC_KEY);
  });

  it('returns "Invalid API key" (401) when the provider rejects the key', async () => {
    const response = await testConnection({ provider: 'anthropic', apiKey: REVOKED_KEY });
    expectEnvelope(response, 401, 'INVALID_API_KEY', 'Invalid API key');
    expect(response.body).not.toContain(REVOKED_KEY);
  });

  it('returns "Provider unreachable — try again" when the provider times out', async () => {
    await testApp.close();
    const hanging: typeof globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    await startApp(hanging, 50);

    const response = await testConnection({ provider: 'openai', apiKey: OPENAI_KEY });

    expectEnvelope(response, 502, 'PROVIDER_UNAVAILABLE', 'Provider unreachable — try again');
  });

  it('rejects a key in the wrong format before calling the provider', async () => {
    expectEnvelope(
      await testConnection({ provider: 'openai', apiKey: ANTHROPIC_KEY }),
      400,
      'VALIDATION_ERROR',
      /Anthropic key/,
    );
    expectEnvelope(
      await testConnection({ provider: 'anthropic', apiKey: OPENAI_KEY }),
      400,
      'VALIDATION_ERROR',
      /sk-ant-/,
    );
    expectEnvelope(
      await testConnection({ provider: 'anthropic', apiKey: 'short' }),
      400,
      'VALIDATION_ERROR',
    );
    expect(calls).toHaveLength(0);
  });

  it('tests the stored key when no key is sent, but only for the same provider', async () => {
    await save({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: ANTHROPIC_KEY });
    calls.length = 0;

    expect((await testConnection({ provider: 'anthropic' })).statusCode).toBe(200);
    expect(keyOf(calls[0] as RecordedCall)).toBe(ANTHROPIC_KEY);

    expectEnvelope(
      await testConnection({ provider: 'openai' }),
      400,
      'VALIDATION_ERROR',
      /saved key is for Claude/,
    );
  });

  it('asks for a key when none is stored', async () => {
    expectEnvelope(
      await testConnection({ provider: 'anthropic' }),
      400,
      'VALIDATION_ERROR',
      'Enter an API key',
    );
  });

  it('allows 10 tests a minute per client, then answers 429', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(
        (await testConnection({ provider: 'anthropic', apiKey: ANTHROPIC_KEY })).statusCode,
      ).toBe(200);
    }
    expectEnvelope(
      await testConnection({ provider: 'anthropic', apiKey: ANTHROPIC_KEY }),
      429,
      'RATE_LIMITED',
    );
    expect(calls).toHaveLength(10);
  });
});

describe('PUT /settings/llm', () => {
  it('re-verifies the key server-side, encrypts it, and stores only ciphertext', async () => {
    const response = await save({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      apiKey: ANTHROPIC_KEY,
    });

    expect(response.statusCode).toBe(200);
    expect(llmSettingsSchema.parse(response.json())).toMatchObject({
      configured: true,
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      keyHint: 'WXYZ',
    });
    expect(calls).toHaveLength(1); // the browser's earlier test is never trusted
    const row = await storedRow();
    expect(row).toMatchObject({ keyVersion: 1, keyHint: 'WXYZ' });
    expect(row?.apiKeyIv).toHaveLength(12);
    expect(row?.apiKeyTag).toHaveLength(16);
    const everything = JSON.stringify(row) + (row?.apiKeyCiphertext.toString('latin1') ?? '');
    expect(everything).not.toContain(ANTHROPIC_KEY);
    expect(everything).not.toContain(Buffer.from(ANTHROPIC_KEY).toString('hex'));
    expect(everything).not.toContain('settings-test-key');
  });

  it('rejects a model the key cannot use (400) and saves nothing', async () => {
    const response = await save({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      apiKey: ANTHROPIC_KEY,
    });
    expectEnvelope(response, 400, 'VALIDATION_ERROR', /claude-haiku-4-5 is not available/);
    expect(await storedRow()).toBeUndefined();
  });

  it('rejects an invalid key (401) and saves nothing', async () => {
    expectEnvelope(
      await save({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: REVOKED_KEY }),
      401,
      'INVALID_API_KEY',
    );
    expect(await storedRow()).toBeUndefined();
  });

  it('keeps the stored key when no key is sent and the provider is unchanged', async () => {
    await save({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: ANTHROPIC_KEY });
    const before = await storedRow();
    calls.length = 0;

    const response = await save({ provider: 'anthropic', model: 'claude-sonnet-5-5' });

    expect(response.statusCode).toBe(200);
    expect(keyOf(calls[0] as RecordedCall)).toBe(ANTHROPIC_KEY);
    const after = await storedRow();
    expect(after?.model).toBe('claude-sonnet-5-5');
    expect(after?.apiKeyCiphertext.equals(before?.apiKeyCiphertext ?? Buffer.alloc(0))).toBe(true);
    expect(after?.keyHint).toBe('WXYZ');
  });

  it('requires a key when the provider changes, then replaces the old ciphertext', async () => {
    await save({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: ANTHROPIC_KEY });

    expectEnvelope(
      await save({ provider: 'openai', model: 'gpt-6-luna' }),
      400,
      'VALIDATION_ERROR',
    );

    const switched = await save({ provider: 'openai', model: 'gpt-6-luna', apiKey: OPENAI_KEY });
    expect(llmSettingsSchema.parse(switched.json())).toMatchObject({
      provider: 'openai',
      model: 'gpt-6-luna',
      keyHint: 'a1b2',
    });
    expect(await testDb.db.select().from(llmSettings)).toHaveLength(1);
  });

  it('replaces the key with a new one for the same provider', async () => {
    await save({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: ANTHROPIC_KEY });
    await save({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: OTHER_ANTHROPIC_KEY });
    expect((await storedRow())?.keyHint).toBe('ABCD');
  });
});

describe('logs', () => {
  it('never contain an API key, from requests or from anything logged with one', async () => {
    await testConnection({ provider: 'anthropic', apiKey: ANTHROPIC_KEY });
    await testConnection({ provider: 'anthropic', apiKey: REVOKED_KEY });
    await save({ provider: 'openai', model: 'gpt-6-luna', apiKey: OPENAI_KEY });
    // A careless future log call is censored too.
    testApp.app.log.info({ body: { apiKey: OTHER_ANTHROPIC_KEY } }, 'careless log');
    testApp.app.log.info({ apiKey: OTHER_ANTHROPIC_KEY }, 'careless log');

    expect(logLines.length).toBeGreaterThan(4);
    const output = logLines.join('');
    for (const key of ALL_KEYS) {
      expect(output).not.toContain(key);
    }
    expect(output).toContain('[Redacted]');
  });
});
