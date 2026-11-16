import { beforeAll, describe, expect, it } from 'vitest';
import { FIXTURES_DIR } from '../../test/llm.js';
import { locateEvidence, normaliseForMatching } from '../normalise/match-text.js';
import { parsePdfFile } from '../pdf/parse-pdf.js';
import type { ModelField } from './parse-model-output.js';
import { isValueSupportedByEvidence } from './value-support.js';
import { GAP_REASONS, verifyField } from './verify-fields.js';

let invoiceV1: string;
let invoiceV2: string;

beforeAll(async () => {
  invoiceV1 = await parsePdfFile(`${FIXTURES_DIR}documents/invoice-001.pdf`, 100_000);
  invoiceV2 = await parsePdfFile(`${FIXTURES_DIR}documents/invoice-001.v2.pdf`, 100_000);
});

const claim = (
  value: string | null,
  evidence: string | null,
  reason: string | null = null,
): ModelField => ({
  field: 'total_amount',
  value,
  evidence,
  not_found_reason: reason,
});

describe('normaliseForMatching', () => {
  it('applies NFKC, collapses every whitespace run (CRLF, CR, LF, tabs) and trims', () => {
    expect(normaliseForMatching('  Total\r\nDue:\t $5,230.29 \r ')).toBe('Total Due: $5,230.29');
    expect(normaliseForMatching('ﬁnal Ｔotal')).toBe('final Total');
  });

  it('does not fold case or strip punctuation', () => {
    expect(normaliseForMatching('TOTAL due: $5,230.29.')).toBe('TOTAL due: $5,230.29.');
  });
});

describe('locateEvidence', () => {
  it('finds an exact passage and maps it back to the exact raw substring', () => {
    const location = locateEvidence(invoiceV1, 'Total Due: $5,230.29');
    expect(location).not.toBeNull();
    expect(invoiceV1.slice(location?.start, location?.end)).toBe('Total Due: $5,230.29');
    expect(location?.passage).toBe('Total Due: $5,230.29');
  });

  it('matches across \\r\\n vs \\n and extra spaces, and returns the raw text with its line break', () => {
    const raw = 'TERM. The initial term shall be twenty-four (24)\r\nmonths, commencing on';
    const location = locateEvidence(raw, 'shall be   twenty-four (24) months');
    expect(location?.passage).toBe('shall be twenty-four (24)\r\nmonths');
    expect(raw.slice(location?.start, location?.end)).toBe(location?.passage);
  });

  it('maps offsets correctly after a ligature expands under NFKC', () => {
    const raw = 'The ﬁnal amount: $10';
    const location = locateEvidence(raw, 'final amount: $10');
    expect(location?.passage).toBe('ﬁnal amount: $10');
  });

  it('does not match a paraphrase', () => {
    expect(locateEvidence(invoiceV1, 'Total amount due: $5,230.29')).toBeNull();
  });

  it('does not match case-changed text', () => {
    expect(locateEvidence(invoiceV1, 'TOTAL DUE: $5,230.29')).toBeNull();
  });

  it('returns null for empty or whitespace-only evidence', () => {
    expect(locateEvidence(invoiceV1, '')).toBeNull();
    expect(locateEvidence(invoiceV1, ' \n\t ')).toBeNull();
  });
});

describe('verifyField (the hallucination defence)', () => {
  it('keeps a value whose evidence is in the text, with offsets and normalised value', () => {
    const result = verifyField(
      'money',
      'total_amount',
      claim('$5,230.29', 'Total Due: $5,230.29'),
      invoiceV1,
    );
    expect(result).toMatchObject({
      value: '$5,230.29',
      normalizedValue: '5230.29 USD',
      evidence: 'Total Due: $5,230.29',
      gapReason: null,
    });
    expect(invoiceV1.slice(result.evidenceStart ?? 0, result.evidenceEnd ?? 0)).toBe(
      result.evidence,
    );
  });

  it('turns paraphrased evidence into a gap and discards the value', () => {
    const result = verifyField(
      'money',
      'total_amount',
      claim('$5,230.29', 'The total due is $5,230.29'),
      invoiceV1,
    );
    expect(result).toMatchObject({
      value: null,
      evidence: null,
      gapReason: GAP_REASONS.evidenceNotFound,
    });
  });

  it('checks evidence only against the SAME version: v1 evidence fails on v2 text', () => {
    const fromV1 = claim('$5,230.29', 'Total Due: $5,230.29');
    expect(verifyField('money', 'total_amount', fromV1, invoiceV1).gapReason).toBeNull();
    expect(verifyField('money', 'total_amount', fromV1, invoiceV2)).toMatchObject({
      value: null,
      gapReason: GAP_REASONS.evidenceNotFound,
    });
  });

  it('turns empty evidence into a gap', () => {
    expect(
      verifyField('money', 'total_amount', claim('$5,230.29', '  '), invoiceV1).gapReason,
    ).toBe(GAP_REASONS.noEvidence);
  });

  it('rejects a value its (real) evidence does not state', () => {
    // The subtotal line exists in the document, but it does not support the total.
    const result = verifyField(
      'money',
      'total_amount',
      claim('$5,230.29', 'Subtotal: $4,815.00'),
      invoiceV1,
    );
    expect(result.gapReason).toBe(GAP_REASONS.notSupported);
  });

  it('uses the model reason for a field it could not find, with a fallback', () => {
    expect(verifyField('money', 'x', claim(null, null, 'Not stated'), invoiceV1).gapReason).toBe(
      'Not stated',
    );
    expect(verifyField('money', 'x', claim(null, null, null), invoiceV1).gapReason).toBe(
      GAP_REASONS.notFound,
    );
  });

  it('reports a field the model did not return', () => {
    expect(verifyField('money', 'x', undefined, invoiceV1).gapReason).toBe(GAP_REASONS.notReturned);
  });

  it('turns an un-normalisable value into a gap naming the type', () => {
    const text = 'Due: upon receipt';
    const result = verifyField(
      'date',
      'due_date',
      claim('upon receipt', 'Due: upon receipt'),
      text,
    );
    expect(result.gapReason).toBe('Value could not be normalised as date');
  });
});

describe('isValueSupportedByEvidence', () => {
  it('accepts a money value stated by its evidence and rejects a changed digit', () => {
    expect(isValueSupportedByEvidence('money', '$5,230.29', 'Total Due: $5,230.29')).toBe(true);
    expect(isValueSupportedByEvidence('money', '5,230.30', 'Total Due: $5,230.29')).toBe(false);
  });

  it('matches numbers by value, not formatting', () => {
    expect(isValueSupportedByEvidence('money', '5230.29', 'Total Due: $5,230.29')).toBe(true);
    expect(
      isValueSupportedByEvidence('number', 'twenty-four', 'term shall be twenty-four (24) months'),
    ).toBe(true);
    expect(isValueSupportedByEvidence('percent', '4.2', 'declined to 4.2%, down from 4.9%')).toBe(
      true,
    );
  });

  it('matches dates in any common format', () => {
    expect(isValueSupportedByEvidence('date', '2025-03-01', 'commencing on March 1, 2025')).toBe(
      true,
    );
    expect(isValueSupportedByEvidence('date', 'March 1, 2025', 'Start: 03/01/2025')).toBe(true);
    expect(isValueSupportedByEvidence('date', '2025-03-02', 'commencing on March 1, 2025')).toBe(
      false,
    );
  });

  it('matches strings case-insensitively but not partially different ones', () => {
    expect(
      isValueSupportedByEvidence(
        'string',
        'Meridian Office Supplies LLC',
        'MERIDIAN OFFICE SUPPLIES LLC',
      ),
    ).toBe(true);
    expect(
      isValueSupportedByEvidence('string', 'Meridian Supplies', 'MERIDIAN OFFICE SUPPLIES LLC'),
    ).toBe(false);
  });
});
