import type { ExtractedField } from '@doc-review/shared';
import { describe, expect, it } from 'vitest';
import {
  type BaselineReview,
  type BaselineSnapshot,
  type BaselineValue,
  compareVersions,
} from './compare-versions.js';

const APPROVAL: BaselineReview = {
  id: 'review-1',
  action: 'approve',
  correctedValue: null,
  note: null,
  reviewer: 'reviewer',
};

function baselineValue(overrides: Partial<BaselineValue> = {}): BaselineValue {
  return {
    id: 'v1-total',
    field: 'total_amount',
    value: '$5,230.29',
    normalizedValue: '5230.29 USD',
    evidence: 'Total Due: $5,230.29',
    gapKind: null,
    latestReview: APPROVAL,
    ...overrides,
  };
}

function candidateField(overrides: Partial<ExtractedField> = {}): ExtractedField {
  return {
    field: 'total_amount',
    value: '$5,230.29',
    normalizedValue: '5230.29 USD',
    evidence: 'Total Due: $5,230.29',
    gapReason: null,
    gapKind: null,
    ...overrides,
  };
}

const gapValue = (kind: BaselineValue['gapKind']) =>
  baselineValue({ value: null, normalizedValue: null, evidence: null, gapKind: kind });
const gapField = (kind: ExtractedField['gapKind']) =>
  candidateField({
    value: null,
    normalizedValue: null,
    evidence: null,
    gapReason: 'x',
    gapKind: kind,
  });

function compareOne(
  baseline: { text: string; value: BaselineValue },
  candidate: { text: string; field: ExtractedField },
) {
  const snapshot: BaselineSnapshot = { parsedText: baseline.text, values: [baseline.value] };
  const [result] = compareVersions(snapshot, {
    parsedText: candidate.text,
    fields: [candidate.field],
  });
  return result;
}

const V1 = 'INVOICE\nSubtotal: $4,815.00\nTotal Due: $5,230.29\nThanks';

describe('compareVersions', () => {
  it.each([
    {
      name: 'identical value and evidence',
      baseline: { text: V1, value: baselineValue() },
      candidate: { text: V1, field: candidateField() },
      expected: { comparison: 'unchanged', reason: 'evidence_matches' },
    },
    {
      name: 'same value, quoted differently, both passages present in both texts',
      baseline: { text: V1, value: baselineValue({ evidence: 'Total Due: $5,230.29' }) },
      candidate: { text: V1, field: candidateField({ evidence: 'Due: $5,230.29\nThanks' }) },
      expected: { comparison: 'unchanged', reason: 'evidence_matches' },
    },
    {
      name: 'whole text reordered and reflowed, passage intact',
      baseline: { text: V1, value: baselineValue() },
      candidate: {
        text: 'Thanks\nNEW HEADER LINE\nTotal   Due:\r\n$5,230.29\nSubtotal: $4,815.00\nINVOICE',
        field: candidateField({ evidence: 'Total Due: $5,230.29' }),
      },
      expected: { comparison: 'unchanged', reason: 'evidence_matches' },
    },
    {
      name: 'same value, baseline evidence no longer in the candidate text',
      baseline: { text: V1, value: baselineValue() },
      candidate: {
        text: 'Amount payable: $5,230.29',
        field: candidateField({ evidence: 'Amount payable: $5,230.29' }),
      },
      expected: { comparison: 'changed', reason: 'baseline_evidence_missing' },
    },
    {
      name: 'same value, candidate evidence not in the baseline text',
      baseline: { text: `${V1}\nAmount payable: $5,230.29`, value: baselineValue() },
      candidate: {
        text: 'Total Due: $5,230.29 (incl. tax)',
        field: candidateField({ evidence: 'Total Due: $5,230.29 (incl. tax)' }),
      },
      expected: { comparison: 'changed', reason: 'candidate_evidence_missing' },
    },
    {
      name: 'value differs',
      baseline: { text: V1, value: baselineValue() },
      candidate: {
        text: 'Total Due: $6,126.45',
        field: candidateField({
          value: '$6,126.45',
          normalizedValue: '6126.45 USD',
          evidence: 'Total Due: $6,126.45',
        }),
      },
      expected: { comparison: 'changed', reason: 'value_differs' },
    },
    {
      name: 'value became a gap',
      baseline: { text: V1, value: baselineValue() },
      candidate: { text: V1, field: gapField('not_found') },
      expected: { comparison: 'changed', reason: 'became_gap' },
    },
    {
      name: 'gap resolved into a value',
      baseline: { text: V1, value: gapValue('not_found') },
      candidate: { text: V1, field: candidateField() },
      expected: { comparison: 'changed', reason: 'gap_resolved' },
    },
    {
      name: 'not found in both versions',
      baseline: { text: V1, value: gapValue('not_found') },
      candidate: { text: V1, field: gapField('not_found') },
      expected: { comparison: 'unchanged', reason: 'still_not_found' },
    },
    {
      name: 'unverified evidence before, not found now',
      baseline: { text: V1, value: gapValue('evidence_not_verified') },
      candidate: { text: V1, field: gapField('not_found') },
      expected: { comparison: 'changed', reason: 'gap_kind_changed' },
    },
    {
      name: 'not found before, unverified evidence now',
      baseline: { text: V1, value: gapValue('not_found') },
      candidate: { text: V1, field: gapField('evidence_not_verified') },
      expected: { comparison: 'changed', reason: 'gap_kind_changed' },
    },
    {
      name: 'the same unverified gap in both versions',
      baseline: { text: V1, value: gapValue('evidence_not_verified') },
      candidate: { text: V1, field: gapField('evidence_not_verified') },
      expected: { comparison: 'changed', reason: 'gap_kind_changed' },
    },
  ])('$name → $expected.comparison ($expected.reason)', ({ baseline, candidate, expected }) => {
    expect(compareOne(baseline, candidate)).toMatchObject(expected);
  });

  it('compares formatting-insensitive values through their normalised form', () => {
    const result = compareOne(
      {
        text: 'Start: March 1, 2025',
        value: baselineValue({
          value: 'March 1, 2025',
          normalizedValue: '2025-03-01',
          evidence: 'Start: March 1, 2025',
        }),
      },
      {
        text: 'Start: March 1, 2025',
        field: candidateField({
          value: 'March 1, 2025 ',
          normalizedValue: '2025-03-01',
          evidence: 'March 1, 2025',
        }),
      },
    );
    expect(result?.comparison).toBe('unchanged');
  });

  it('treats a missing parsed text as missing evidence (never unchanged by accident)', () => {
    const [result] = compareVersions(
      { parsedText: null, values: [baselineValue()] },
      { parsedText: V1, fields: [candidateField()] },
    );
    expect(result).toMatchObject({ comparison: 'changed', reason: 'candidate_evidence_missing' });
  });

  it('links the previous value either way, but carries the review only when unchanged', () => {
    const [unchanged, changed] = compareVersions(
      {
        parsedText: `${V1}\nDue Date: 2025-10-14`,
        values: [
          baselineValue(),
          baselineValue({
            id: 'v1-due',
            field: 'due_date',
            value: '2025-10-14',
            normalizedValue: '2025-10-14',
            evidence: 'Due Date: 2025-10-14',
          }),
        ],
      },
      {
        parsedText: `${V1}\nDue Date: 2025-11-13`,
        fields: [
          candidateField(),
          candidateField({
            field: 'due_date',
            value: '2025-11-13',
            normalizedValue: '2025-11-13',
            evidence: 'Due Date: 2025-11-13',
          }),
        ],
      },
    );
    expect(unchanged).toMatchObject({ previousValueId: 'v1-total', carryReview: APPROVAL });
    expect(changed).toMatchObject({
      previousValueId: 'v1-due',
      carryReview: null,
      reason: 'value_differs',
    });
  });

  it('carries nothing for an unchanged value that was never reviewed', () => {
    const result = compareOne(
      { text: V1, value: baselineValue({ latestReview: null }) },
      { text: V1, field: candidateField() },
    );
    expect(result).toMatchObject({
      comparison: 'unchanged',
      carryReview: null,
      previousValueId: 'v1-total',
    });
  });

  it('marks a field the baseline does not have as added', () => {
    const [result] = compareVersions(
      { parsedText: V1, values: [] },
      { parsedText: V1, fields: [candidateField()] },
    );
    expect(result).toMatchObject({
      comparison: 'added',
      reason: 'no_baseline_value',
      previousValueId: null,
    });
  });

  it('marks every field initial when there is no baseline', () => {
    const results = compareVersions(null, {
      parsedText: V1,
      fields: [candidateField(), candidateField({ field: 'due_date' })],
    });
    expect(results.map((r) => [r.comparison, r.reason, r.previousValueId])).toEqual([
      ['initial', null, null],
      ['initial', null, null],
    ]);
  });
});
