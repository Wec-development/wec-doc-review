import { type DocumentType, extractionResultSchema, type ExtractedField } from '@doc-review/shared';
import { describe, expect, it } from 'vitest';
import { jsonResponse, loadRecording, recordedLlmExtractor, replayFetch } from '../test/llm.js';
import { PROMPT_VERSION } from './prompt/build-prompt.js';
import { GAP_REASONS } from './validate/verify-fields.js';

/**
 * Golden tests: the production pipeline (real PDF parser, real Anthropic SDK client, real
 * verification) on each fixture, with the model's reply replayed from test/recordings.
 */
async function extractWithRecording(documentType: DocumentType, pdf: string, recording: string) {
  const { fetch } = replayFetch(() => jsonResponse(200, loadRecording(recording)));
  const result = await recordedLlmExtractor(fetch).extract({
    versionId: '00000000-0000-4000-8000-000000000000',
    documentType,
    filePath: `fixtures/documents/${pdf}`,
    signal: new AbortController().signal,
  });
  const byField = new Map(result.fields.map((f) => [f.field, f]));
  return { result: extractionResultSchema.parse(result), byField };
}

function expectKept(
  field: ExtractedField | undefined,
  normalizedValue: string,
  parsedText: string,
) {
  expect(field).toMatchObject({ normalizedValue, gapReason: null });
  // The stored evidence is exactly the raw text at the stored offsets.
  expect(parsedText.slice(field?.evidenceStart ?? 0, field?.evidenceEnd ?? 0)).toBe(
    field?.evidence,
  );
}

describe('golden: invoice-001.pdf', () => {
  it('extracts the invoice number and the total due, not the subtotal', async () => {
    const { result, byField } = await extractWithRecording(
      'invoice',
      'invoice-001.pdf',
      'invoice-001',
    );

    expectKept(byField.get('invoice_number'), 'INV-2025-0847', result.parsedText ?? '');
    expectKept(byField.get('total_amount'), '5230.29 USD', result.parsedText ?? '');
    expectKept(byField.get('issue_date'), '2025-09-14', result.parsedText ?? '');
    expectKept(byField.get('due_date'), '2025-10-14', result.parsedText ?? '');
    expect(result.fields.every((f) => f.gapReason === null)).toBe(true);
  });

  it('records the prompt, prompt version, model, raw response and usage', async () => {
    const { result } = await extractWithRecording('invoice', 'invoice-001.pdf', 'invoice-001');
    expect(result).toMatchObject({
      promptVersion: PROMPT_VERSION,
      model: 'claude-opus-5-5',
      usage: { inputTokens: 912, outputTokens: 486 },
      rawResponse: expect.objectContaining({ id: 'msg_rec_invoice_001' }),
    });
    expect(result.prompt).toContain('<document>\nMERIDIAN OFFICE SUPPLIES LLC');
    expect(result.durationMs).toEqual(expect.any(Number));
  });

  it('turns a fabricated quote into a gap and discards its value', async () => {
    const { byField } = await extractWithRecording(
      'invoice',
      'invoice-001.pdf',
      'invoice-001.fabricated-evidence',
    );
    expect(byField.get('total_amount')).toMatchObject({
      value: null,
      evidence: null,
      gapReason: GAP_REASONS.evidenceNotFound,
    });
    expect(byField.get('invoice_number')?.normalizedValue).toBe('INV-2025-0847');
  });
});

describe('golden: lease-excerpt-001.pdf', () => {
  it('reads a term written in words and digits across a line break, and the start date', async () => {
    const { result, byField } = await extractWithRecording(
      'lease',
      'lease-excerpt-001.pdf',
      'lease-excerpt-001',
    );
    expectKept(byField.get('term_months'), '24', result.parsedText ?? '');
    expectKept(byField.get('lease_start'), '2025-03-01', result.parsedText ?? '');
    expectKept(byField.get('monthly_rent'), '2350 USD', result.parsedText ?? '');
    expect(byField.get('term_months')?.evidence).toContain('twenty-four (24)\nmonths');
  });
});

describe('golden: market-report-excerpt-001.pdf', () => {
  it('takes the current vacancy rate, the one-bedroom rent, and reports income as a gap', async () => {
    const { result, byField } = await extractWithRecording(
      'market_report',
      'market-report-excerpt-001.pdf',
      'market-report-excerpt-001',
    );
    expectKept(byField.get('vacancy_rate'), '4.2', result.parsedText ?? '');
    expectKept(byField.get('average_rent_1br'), '1985 USD', result.parsedText ?? '');
    expect(byField.get('median_household_income')).toMatchObject({
      value: null,
      gapReason: expect.stringMatching(/does not state/),
    });
  });
});

describe('golden: the same evidence against another version', () => {
  it('rejects invoice v1 quotes when extracting the revised invoice (v2 text)', async () => {
    const { byField } = await extractWithRecording('invoice', 'invoice-001.v2.pdf', 'invoice-001');
    // Unchanged lines still verify against v2; the changed due date and total do not.
    expect(byField.get('invoice_number')?.normalizedValue).toBe('INV-2025-0847');
    expect(byField.get('due_date')?.gapReason).toBe(GAP_REASONS.evidenceNotFound);
    expect(byField.get('total_amount')?.gapReason).toBe(GAP_REASONS.evidenceNotFound);
  });
});
