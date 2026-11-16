import { describe, expect, it } from 'vitest';
import { RetryableError } from '../errors.js';
import { parseModelOutput } from './parse-model-output.js';
import { GAP_REASONS, verifyFields } from './verify-fields.js';

const entry = (field: string, value: string | null = 'x', evidence: string | null = 'x') => ({
  field,
  value,
  evidence,
  not_found_reason: null,
});

describe('parseModelOutput', () => {
  it('throws a RetryableError when the output is malformed', () => {
    expect(() => parseModelOutput('invoice', null)).toThrow(RetryableError);
    expect(() => parseModelOutput('invoice', { fields: 'nope' })).toThrow(RetryableError);
    expect(() => parseModelOutput('invoice', { values: [] })).toThrow(RetryableError);
  });

  it('maps every expected field, ignoring unknown fields and keeping the first duplicate', () => {
    const claims = parseModelOutput('invoice', {
      fields: [
        entry('invoice_number', 'FIRST'),
        entry('invoice_number', 'SECOND'),
        entry('tax_id'),
      ],
    });
    expect([...claims.keys()]).toEqual([
      'invoice_number',
      'issue_date',
      'due_date',
      'vendor_name',
      'total_amount',
    ]);
    expect(claims.get('invoice_number')?.value).toBe('FIRST');
    expect(claims.has('tax_id')).toBe(false);
  });

  it('ignores a malformed entry instead of failing the whole output', () => {
    const claims = parseModelOutput('invoice', { fields: [{ field: 'due_date', value: 42 }] });
    expect(claims.get('due_date')).toBeUndefined();
  });

  it('turns a field the model did not return into a gap "Not returned by the model"', () => {
    const text = 'Invoice Number: INV-1';
    const claims = parseModelOutput('invoice', {
      fields: [entry('invoice_number', 'INV-1', 'Invoice Number: INV-1')],
    });
    const fields = verifyFields('invoice', claims, text);
    expect(fields[0]).toMatchObject({ field: 'invoice_number', value: 'INV-1' });
    expect(fields.slice(1).map((f) => f.gapReason)).toEqual(Array(4).fill(GAP_REASONS.notReturned));
  });
});
