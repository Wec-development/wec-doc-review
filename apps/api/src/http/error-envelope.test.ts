import { errorEnvelopeSchema } from '@doc-review/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../errors.js';
import { connectTestDatabase, resetDatabase, type TestDatabase } from '../test/db.js';
import {
  createTestApp,
  expectError,
  pdfBytes,
  type TestApp,
  uploadDocument,
  uploadVersion,
} from '../test/http.js';
import { toErrorResponse } from './error-handler.js';

describe('toErrorResponse', () => {
  it('maps Zod errors to 400 VALIDATION_ERROR with the failing paths', () => {
    const zodError = z.object({ type: z.string() }).safeParse({}).error;
    expect(toErrorResponse(zodError)).toEqual({
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request is invalid',
          details: [{ path: 'type', message: expect.any(String) }],
        },
      },
    });
  });

  it('maps domain errors to their status and code', () => {
    expect(toErrorResponse(new NotFoundError('gone')).statusCode).toBe(404);
    expect(toErrorResponse(new ConflictError('clash')).body.error).toEqual({
      code: 'CONFLICT',
      message: 'clash',
    });
  });

  it('hides the message of unexpected errors, so no SQL or stack leaks', () => {
    const response = toErrorResponse(new Error('relation "secret" does not exist: select * ...'));
    expect(response).toEqual({
      statusCode: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    });
  });
});

describe('error envelope over HTTP', () => {
  let testDb: TestDatabase;
  let testApp: TestApp;

  beforeAll(() => {
    testDb = connectTestDatabase();
  });
  afterAll(() => testDb.close());
  beforeEach(async () => {
    await resetDatabase(testDb.db);
    testApp = await createTestApp(testDb.db, { options: { maxUploadMb: 0.01 } });
  });
  afterEach(() => testApp.close());

  it('has the same shape for 400, 404, 409, 413 and 415', async () => {
    const contents = pdfBytes('envelope');
    const created = (
      await uploadDocument(testApp.app, { type: 'invoice', file: { contents } })
    ).json();

    const responses = {
      400: await uploadDocument(testApp.app, { type: 'unknown' }),
      404: await testApp.app.inject('/documents/00000000-0000-4000-8000-000000000000'),
      409: await uploadVersion(testApp.app, created.documentId, { contents }),
      413: await uploadDocument(testApp.app, {
        type: 'invoice',
        file: { contents: pdfBytes('large', 20 * 1024) },
      }),
      415: await uploadDocument(testApp.app, {
        type: 'invoice',
        file: { contents: Buffer.from('plain'), contentType: 'text/plain' },
      }),
    };

    expectError(responses[400], 400, 'VALIDATION_ERROR');
    expectError(responses[404], 404, 'NOT_FOUND');
    expectError(responses[409], 409, 'CONFLICT');
    expectError(responses[413], 413, 'PAYLOAD_TOO_LARGE');
    expectError(responses[415], 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('answers unknown routes and malformed JSON with the envelope too', async () => {
    expectError(await testApp.app.inject('/nope'), 404, 'NOT_FOUND');
    const badJson = await testApp.app.inject({
      method: 'POST',
      url: '/values/00000000-0000-4000-8000-000000000000/review',
      headers: { 'content-type': 'application/json' },
      payload: '{"action":',
    });
    expect(badJson.statusCode).toBe(400);
    expect(errorEnvelopeSchema.safeParse(badJson.json()).success).toBe(true);
  });
});
