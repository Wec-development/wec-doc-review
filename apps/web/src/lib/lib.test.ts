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
import { pageNumbers, paginate, parsePage } from './pagination.js';
import { filterValues, STATUS_FILTERS } from './status-filter.js';
import { addFiles, blockingProblem, MAX_UPLOAD_BYTES, submitLabel } from './upload.js';
import { countAwaitingReview, groupValues } from './group-values.js';
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
    expect(reviewMeta(makeValue({ reviewState: 'approved' }))).toEqual({
      label: 'Approved',
      tone: 'approved',
    });
    expect(reviewMeta(makeGap({ reviewState: 'approved' }))).toEqual({
      label: 'Gap confirmed',
      tone: 'approved',
    });
    expect(reviewMeta(makeValue({ reviewState: 'corrected' }))).toEqual({
      label: 'Corrected',
      tone: 'corrected',
    });
  });
});

describe('countAwaitingReview', () => {
  it('counts pending values and pending gaps, not reviewed or carried ones', () => {
    expect(countAwaitingReview(invoiceV2Detail().values)).toBe(2);
    expect(
      countAwaitingReview([
        makeValue(),
        makeGap(),
        makeGap({ reviewState: 'approved' }),
        makeValue({ reviewState: 'corrected' }),
        makeValue({ reviewState: 'carried_over' }),
      ]),
    ).toBe(2);
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
    expect(progressLine(makeProgress({ pending: 2, gaps: 1, carriedOver: 3 }))).toBe(
      '2 pending · 1 gap · 3 carried over · 0 approved',
    );
    expect(progressLine(makeProgress({ pending: 2, carriedOver: 3 }))).toBe(
      '2 pending · 3 carried over · 0 approved',
    );
  });
});

describe('multi-file upload helpers', () => {
  const pdfFile = (name: string, size = 10) => {
    const file = new File(['%PDF-1.4'], name, { type: 'application/pdf', lastModified: 1 });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  };
  let id = 0;
  const nextId = () => `f${(id += 1)}`;

  it('validates each added file and skips duplicates', () => {
    const big = pdfFile('big.pdf', MAX_UPLOAD_BYTES + 1);
    const items = addFiles([], [pdfFile('a.pdf'), big, pdfFile('a.pdf')], {
      multiple: true,
      nextId,
    });
    expect(items.map((item) => [item.file.name, item.status, item.message])).toEqual([
      ['a.pdf', 'ready', null],
      ['big.pdf', 'invalid', 'File too large — the limit is 10 MB.'],
    ]);
  });

  it('replaces the file in single-file mode (new version)', () => {
    const first = addFiles([], [pdfFile('v2.pdf')], { multiple: false, nextId });
    const second = addFiles(first, [pdfFile('v3.pdf'), pdfFile('v4.pdf')], {
      multiple: false,
      nextId,
    });
    expect(second.map((item) => item.file.name)).toEqual(['v3.pdf']);
  });

  it('explains what blocks the upload', () => {
    expect(blockingProblem([])).toBe('Choose a PDF file to upload.');
    const ok = addFiles([], [pdfFile('a.pdf')], { multiple: true, nextId });
    expect(blockingProblem(ok)).toBeNull();
    const text = new File(['x'], 'x.txt', { type: 'text/plain' });
    const one = addFiles([], [text], { multiple: true, nextId });
    expect(blockingProblem(one)).toBe('Only PDF files are supported.');
    const two = addFiles(ok, [text, new File(['y'], 'y.txt', { type: 'text/plain' })], {
      multiple: true,
      nextId,
    });
    expect(blockingProblem(two)).toMatch(/^2 files can't be uploaded/);
  });

  it('labels the submit button by how many documents will be created', () => {
    expect(submitLabel(0)).toBe('Upload and extract');
    expect(submitLabel(1)).toBe('Upload and extract');
    expect(submitLabel(4)).toBe('Upload 4 documents');
  });
});

describe('status filters', () => {
  const values = [
    makeValue({ field: 'a' }),
    makeGap({ field: 'b' }),
    makeGap({ field: 'c', reviewState: 'approved' }),
    makeValue({ field: 'd', reviewState: 'approved' }),
    makeValue({ field: 'e', reviewState: 'corrected' }),
    makeValue({ field: 'f', reviewState: 'carried_over' }),
  ];
  const fields = (filter: Parameters<typeof filterValues>[1]) =>
    filterValues(values, filter).map((value) => value.field);

  it('match the way the API counts: pending includes pending gaps; gaps are any state', () => {
    expect(fields('all')).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(fields('pending')).toEqual(['a', 'b']);
    expect(fields('gaps')).toEqual(['b', 'c']);
    expect(fields('approved')).toEqual(['c', 'd']);
    expect(fields('corrected')).toEqual(['e']);
    expect(fields('carried')).toEqual(['f']);
  });

  it('label each button with its count', () => {
    const progress = makeProgress({ pending: 1, gaps: 1, total: 6 });
    expect(STATUS_FILTERS.map((option) => option.label(option.count(progress)))).toEqual([
      'All 6',
      '1 pending',
      '1 gap',
      '0 carried over',
      '0 approved',
      '0 corrected',
    ]);
  });
});

describe('pagination', () => {
  const items = Array.from({ length: 60 }, (_, index) => index + 1);

  it('reads ?page= leniently', () => {
    expect([null, '', '0', '-2', '1.5', 'abc', '3'].map(parsePage)).toEqual([1, 1, 1, 1, 1, 1, 3]);
  });

  it('slices a page and reports what is shown', () => {
    expect(paginate(items, 1, 25)).toMatchObject({
      page: 1,
      pageCount: 3,
      from: 1,
      to: 25,
      total: 60,
    });
    const last = paginate(items, 3, 25);
    expect(last).toMatchObject({ page: 3, from: 51, to: 60 });
    expect(last.items).toHaveLength(10);
  });

  it('shows the last page for a page past the end, and handles an empty list', () => {
    expect(paginate(items, 99, 25).page).toBe(3);
    expect(paginate([], 1, 25)).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });

  it('lists page numbers with gaps, never hiding a single page behind …', () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(5, 12)).toEqual([1, 'gap', 4, 5, 6, 'gap', 12]);
    expect(pageNumbers(3, 12)).toEqual([1, 2, 3, 4, 'gap', 12]);
    expect(pageNumbers(12, 12)).toEqual([1, 'gap', 11, 12]);
  });
});
