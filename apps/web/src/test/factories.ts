import type {
  DocumentDetail,
  DocumentSummary,
  ExtractedValue,
  Review,
  ReviewProgress,
} from '@doc-review/shared';

/** Typed fixtures built from the shared API types (never ad-hoc objects). */

let sequence = 0;
const uuid = () => {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
};
const AT = '2026-11-12T10:00:00.000Z';

export function makeProgress(overrides: Partial<ReviewProgress> = {}): ReviewProgress {
  return { pending: 0, approved: 0, corrected: 0, carriedOver: 0, gaps: 0, total: 0, ...overrides };
}

export function makeSummary(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: uuid(),
    type: 'invoice',
    title: 'Invoice — Meridian Office Supplies',
    currentVersionNo: 1,
    status: 'extracted',
    error: null,
    progress: makeProgress({ pending: 5, total: 5 }),
    updatedAt: AT,
    ...overrides,
  };
}

export function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    action: 'approve',
    correctedValue: null,
    note: null,
    reviewer: 'reviewer',
    createdAt: AT,
    ...overrides,
  };
}

export function makeValue(overrides: Partial<ExtractedValue> = {}): ExtractedValue {
  return {
    id: uuid(),
    field: 'invoice_number',
    value: 'INV-2025-0847',
    normalizedValue: 'INV-2025-0847',
    evidence: 'Invoice Number: INV-2025-0847',
    evidenceStart: null,
    evidenceEnd: null,
    gapReason: null,
    gapKind: null,
    comparison: 'initial',
    comparisonReason: null,
    carriedOver: false,
    reviewState: 'pending',
    carriedAction: null,
    latestReview: null,
    previous: null,
    ...overrides,
  };
}

export function makeGap(overrides: Partial<ExtractedValue> = {}): ExtractedValue {
  return makeValue({
    field: 'median_household_income',
    value: null,
    normalizedValue: null,
    evidence: null,
    gapReason: 'The report does not state median household income.',
    gapKind: 'not_found',
    ...overrides,
  });
}

export function makeDetail(
  overrides: {
    document?: Partial<DocumentDetail['document']>;
    version?: Partial<DocumentDetail['version']>;
    versions?: DocumentDetail['versions'];
    values?: ExtractedValue[];
  } = {},
): DocumentDetail {
  const versionNo = overrides.version?.versionNo ?? 1;
  return {
    document: {
      id: uuid(),
      type: 'invoice',
      title: 'Invoice — Meridian Office Supplies',
      currentVersionNo: versionNo,
      createdAt: AT,
      ...overrides.document,
    },
    version: {
      id: uuid(),
      versionNo,
      status: 'extracted',
      error: null,
      baselineVersionNo: null,
      parsedText: null,
      createdAt: AT,
      ...overrides.version,
    },
    versions: overrides.versions ?? [{ versionNo, status: 'extracted', createdAt: AT }],
    values: overrides.values ?? [],
  };
}

export const INVOICE_V2_TEXT = [
  'MERIDIAN OFFICE SUPPLIES LLC',
  'INVOICE (REVISED)',
  'Invoice Number: INV-2025-0847',
  'Issue Date: 2025-09-14',
  'Due Date: 2025-11-13',
  'Total Due: $6,126.45',
].join('\n');

const at = (passage: string) => {
  const start = INVOICE_V2_TEXT.indexOf(passage);
  return { evidence: passage, evidenceStart: start, evidenceEnd: start + passage.length };
};

/** Invoice v2 after re-extraction: 2 changed (pending) and 3 carried over, as in Review.dc.html. */
export function invoiceV2Detail(): DocumentDetail {
  const carried = (field: string, value: string, passage: string, corrected = false) =>
    makeValue({
      field,
      value,
      normalizedValue: value,
      ...at(passage),
      comparison: 'unchanged',
      comparisonReason: 'evidence_matches',
      carriedOver: true,
      reviewState: 'carried_over',
      carriedAction: corrected ? 'corrected' : 'approved',
      latestReview: corrected
        ? makeReview({
            action: 'correct',
            correctedValue: 'Meridian Office Supplies LLC',
            note: 'normalise casing',
          })
        : makeReview(),
      previous: { versionNo: 1, value, evidence: passage, latestReview: makeReview() },
    });
  const changed = (
    field: string,
    value: string,
    normalized: string,
    passage: string,
    old: string,
    oldPassage: string,
  ) =>
    makeValue({
      field,
      value,
      normalizedValue: normalized,
      ...at(passage),
      comparison: 'changed',
      comparisonReason: 'value_differs',
      previous: { versionNo: 1, value: old, evidence: oldPassage, latestReview: makeReview() },
    });

  return makeDetail({
    document: { currentVersionNo: 2 },
    version: { versionNo: 2, baselineVersionNo: 1, parsedText: INVOICE_V2_TEXT },
    versions: [
      { versionNo: 1, status: 'extracted', createdAt: '2026-09-14T09:00:00.000Z' },
      { versionNo: 2, status: 'extracted', createdAt: AT },
    ],
    values: [
      carried('invoice_number', 'INV-2025-0847', 'Invoice Number: INV-2025-0847'),
      carried('issue_date', '2025-09-14', 'Issue Date: 2025-09-14'),
      changed(
        'due_date',
        '2025-11-13',
        '2025-11-13',
        'Due Date: 2025-11-13',
        '2025-10-14',
        'Due Date: 2025-10-14',
      ),
      carried('vendor_name', 'MERIDIAN OFFICE SUPPLIES LLC', 'MERIDIAN OFFICE SUPPLIES LLC', true),
      changed(
        'total_amount',
        '$6,126.45',
        '6126.45 USD',
        'Total Due: $6,126.45',
        '$5,230.29',
        'Total Due: $5,230.29',
      ),
    ],
  });
}
