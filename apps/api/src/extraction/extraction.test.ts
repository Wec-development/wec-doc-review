import { EXPECTED_FIELDS, extractionResultSchema } from '@doc-review/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { classifyError, ExtractionError } from './errors.js';
import { FakeExtractor } from './fake-extractor.js';

const input = {
  versionId: '00000000-0000-4000-8000-000000000000',
  filePath: 'fixtures/x.pdf',
  signal: new AbortController().signal,
};

describe('classifyError', () => {
  it('uses the retryable flag of an ExtractionError', () => {
    expect(classifyError(new ExtractionError('rate limited', { retryable: true }))).toEqual({
      retryable: true,
      message: 'rate limited',
    });
    expect(classifyError(new ExtractionError('empty PDF', { retryable: false }))).toEqual({
      retryable: false,
      message: 'empty PDF',
    });
  });

  it('treats invalid extractor output as permanent', () => {
    const error = z.object({ fields: z.array(z.string()) }).safeParse({ fields: [1] }).error;
    expect(classifyError(error)).toMatchObject({ retryable: false });
  });

  it('treats other errors (e.g. a dropped connection) as transient', () => {
    expect(classifyError(new Error('Connection terminated'))).toEqual({
      retryable: true,
      message: 'Connection terminated',
    });
    expect(classifyError('weird')).toMatchObject({ retryable: true });
  });
});

describe('FakeExtractor', () => {
  it('returns one valid value per expected field, deterministically', async () => {
    const extractor = new FakeExtractor();
    const first = await extractor.extract({ ...input, documentType: 'invoice' });
    const second = await extractor.extract({ ...input, documentType: 'invoice' });

    expect(extractionResultSchema.parse(first)).toEqual(second);
    expect(first.fields.map((f) => f.field)).toEqual(EXPECTED_FIELDS.invoice.map((f) => f.field));
  });

  it('reports median household income as a gap, like the fixture', async () => {
    const result = await new FakeExtractor().extract({ ...input, documentType: 'market_report' });
    expect(result.fields.find((f) => f.field === 'median_household_income')).toMatchObject({
      value: null,
      gapReason: expect.any(String),
    });
  });

  it('can be told to fail retryably a number of times, then succeed', async () => {
    const extractor = new FakeExtractor({ failuresBeforeSuccess: 1 });
    await expect(extractor.extract({ ...input, documentType: 'lease' })).rejects.toMatchObject({
      retryable: true,
    });
    await expect(extractor.extract({ ...input, documentType: 'lease' })).resolves.toBeDefined();
  });

  it('stops waiting when the run is aborted', async () => {
    const controller = new AbortController();
    const reason = new Error('stop');
    const pending = new FakeExtractor({ delayMs: 10_000 }).extract({
      ...input,
      documentType: 'invoice',
      signal: controller.signal,
    });
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });
});
