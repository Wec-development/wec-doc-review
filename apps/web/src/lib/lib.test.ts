import { describe, expect, it } from 'vitest';
import {
  invoiceV2Detail,
  makeGap,
  makeProgress,
  makeReview,
  makeSummary,
  makeValue,
} from '../test/factories.js';
import { formatValue } from './format-value.js';
import { groupValues } from './group-values.js';
import { highlightSegments, lineOfOffset } from './highlight.js';
import { isInFlight, reviewMeta, statusMeta } from './status.js';
import { listSubtitle, listTotals, progressLine } from './summary.js';

describe('groupValues', () => {
  it('orders the work: needs review, gaps, reviewed, carried over', () => {
    const values = [
      makeValue({ field: 'a', reviewState: 'carried_over' }),
      makeValue({ field: 'b', reviewState: 'approved', latestReview: makeReview() }),
      makeGap({ field: 'c' }),
      makeValue({ field: 'd' }),
      makeValue({ field: 'e', reviewState: 'corrected' }),
    ];
    const groups = groupValues(values);
    expect(groups.needsReview.map((v) => v.field)).toEqual(['d']);
    expect(groups.gaps.map((v) => v.field)).toEqual(['c']);
    expect(groups.reviewed.map((v) => v.field)).toEqual(['b', 'e']);
    expect(groups.carried.map((v) => v.field)).toEqual(['a']);
  });

  it('puts a confirmed gap with the reviewed values', () => {
    const groups = groupValues([makeGap({ reviewState: 'approved' })]);
    expect(groups.gaps).toHaveLength(0);
    expect(groups.reviewed).toHaveLength(1);
  });

  it('groups the invoice v2 fixture into 2 to review and 3 carried over', () => {
    const groups = groupValues(invoiceV2Detail().values);
    expect(groups.needsReview.map((v) => v.field)).toEqual(['due_date', 'total_amount']);
    expect(groups.carried).toHaveLength(3);
  });
});

describe('formatValue', () => {
  it.each([
    ['money', '$6,126.45', '6126.45 USD', '$6,126.45', 'USD'],
    ['money', '$1,985', '1985 USD', '$1,985', 'USD'],
    ['money', '$2,350.00', '2350 USD', '$2,350', 'USD'],
    ['money', '5230.3', '5230.3', '5,230.30', null],
    ['percent', '4.2%', '4.2', '4.2%', null],
    ['number', 'twenty-four (24)', '24', '24', null],
    ['number', '1,200', '1200', '1,200', null],
    ['date', 'March 1, 2025', '2025-03-01', '2025-03-01', null],
    ['string', 'Dana Okafor', 'Dana Okafor', 'Dana Okafor', null],
  ] as const)('%s %s -> %s', (kind, value, normalized, text, unit) => {
    expect(formatValue(kind, value, normalized)).toEqual({ text, unit });
  });

  it('shows the value as written when it has no normalised form, and "No value" for gaps', () => {
    expect(formatValue('money', '$9', null)).toEqual({ text: '$9', unit: null });
    expect(formatValue('money', null, null)).toEqual({ text: 'No value', unit: null });
  });
});

describe('highlightSegments', () => {
  const text = 'Total Due: $5,230.29';

  it('splits text into plain and highlighted segments covering every character once', () => {
    const segments = highlightSegments(text, [{ start: 0, end: 9, key: 'a', tone: 'pending' }]);
    expect(segments.map((s) => [s.text, s.highlight?.key ?? null])).toEqual([
      ['Total Due', 'a'],
      [': $5,230.29', null],
    ]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });

  it('keeps the earlier range on overlap and trims or drops the later one', () => {
    const segments = highlightSegments(text, [
      { start: 6, end: 12, key: 'b', tone: 'neutral' },
      { start: 0, end: 9, key: 'a', tone: 'pending' },
      { start: 2, end: 5, key: 'c', tone: 'pending' },
    ]);
    expect(segments.map((s) => [s.text, s.highlight?.key ?? null])).toEqual([
      ['Total Due', 'a'],
      [': $', 'b'],
      ['5,230.29', null],
    ]);
  });

  it('ignores out-of-range, inverted and non-integer offsets safely', () => {
    const segments = highlightSegments(text, [
      { start: -1, end: 4, key: 'neg', tone: 'pending' },
      { start: 5, end: 500, key: 'far', tone: 'pending' },
      { start: 8, end: 3, key: 'inverted', tone: 'pending' },
      { start: 1.5, end: 3, key: 'fraction', tone: 'pending' },
    ]);
    expect(segments).toEqual([{ text, start: 0, highlight: null }]);
  });

  it('handles empty text', () => {
    expect(highlightSegments('', [{ start: 0, end: 1, key: 'x', tone: 'pending' }])).toEqual([]);
  });
});

describe('lineOfOffset', () => {
  it('returns 1-based line numbers and null for invalid offsets', () => {
    const text = 'one\ntwo\nthree';
    expect(lineOfOffset(text, 0)).toBe(1);
    expect(lineOfOffset(text, 4)).toBe(2);
    expect(lineOfOffset(text, 8)).toBe(3);
    expect(lineOfOffset(text, 99)).toBeNull();
  });
});

describe('statusMeta and reviewMeta', () => {
  it('labels every status, and older versions as superseded', () => {
    expect(statusMeta('queued')).toEqual({ label: 'Queued', tone: 'queued' });
    expect(statusMeta('extracting')).toEqual({ label: 'Extracting', tone: 'extracting' });
    expect(statusMeta('failed')).toEqual({ label: 'Failed', tone: 'failed' });
    expect(statusMeta('extracted', true)).toEqual({ label: 'Superseded', tone: 'superseded' });
    expect(isInFlight('queued') && isInFlight('extracting') && !isInFlight('extracted')).toBe(true);
  });

  it('gives every review state a text label', () => {
    expect(reviewMeta(makeValue()).label).toBe('Pending');
    expect(reviewMeta(makeGap()).label).toBe('Gap');
    expect(
      reviewMeta(makeValue({ reviewState: 'carried_over', carriedAction: 'corrected' })).label,
    ).toBe('Carried over · corrected');
    expect(
      reviewMeta(makeValue({ reviewState: 'carried_over', carriedAction: 'approved' })).label,
    ).toBe('Carried over · approved');
  });
});

describe('list summary', () => {
  it('totals the summary cards and writes the subtitle', () => {
    const totals = listTotals([
      makeSummary({ progress: makeProgress({ pending: 2, carriedOver: 3, total: 5 }) }),
      makeSummary({ progress: makeProgress({ pending: 5, total: 5 }) }),
      makeSummary({ status: 'extracting', progress: makeProgress() }),
    ]);
    expect(totals).toMatchObject({
      needsReview: 7,
      carriedOver: 3,
      documentsNeedingReview: 2,
      documentsInFlight: 1,
    });
    expect(listSubtitle(totals)).toBe(
      '7 values need review across 2 documents. 1 document is still extracting.',
    );
  });

  it('writes the progress line', () => {
    expect(progressLine(makeProgress({ pending: 2, carriedOver: 3 }))).toBe(
      '2 pending · 3 carried over · 0 approved',
    );
  });
});
