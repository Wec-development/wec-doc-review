import type { DocumentSummary, ReviewProgress } from '@doc-review/shared';
import { isInFlight } from './status.js';

export interface ListTotals {
  needsReview: number;
  gaps: number;
  carriedOver: number;
  reviewed: number;
  documentsNeedingReview: number;
  documentsInFlight: number;
}

/** Totals for the summary cards and the subtitle of the documents list. */
export function listTotals(documents: readonly DocumentSummary[]): ListTotals {
  return documents.reduce<ListTotals>(
    (totals, { progress, status }) => ({
      needsReview: totals.needsReview + progress.pending,
      gaps: totals.gaps + progress.gaps,
      carriedOver: totals.carriedOver + progress.carriedOver,
      reviewed: totals.reviewed + progress.approved + progress.corrected,
      documentsNeedingReview: totals.documentsNeedingReview + (progress.pending > 0 ? 1 : 0),
      documentsInFlight: totals.documentsInFlight + (isInFlight(status) ? 1 : 0),
    }),
    {
      needsReview: 0,
      gaps: 0,
      carriedOver: 0,
      reviewed: 0,
      documentsNeedingReview: 0,
      documentsInFlight: 0,
    },
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function listSubtitle(totals: ListTotals): string {
  const review =
    totals.needsReview === 0
      ? 'Nothing needs review.'
      : `${plural(totals.needsReview, 'value needs', 'values need')} review across ${plural(totals.documentsNeedingReview, 'document', 'documents')}.`;
  const inFlight =
    totals.documentsInFlight === 0
      ? ''
      : ` ${plural(totals.documentsInFlight, 'document is', 'documents are')} still extracting.`;
  return review + inFlight;
}

/**
 * "2 pending · 1 gap · 3 carried over · 0 approved", in the detail bar's order. Zero gaps,
 * carried and corrected parts are left out.
 */
export function progressLine(progress: ReviewProgress): string {
  const parts = [`${progress.pending} pending`];
  if (progress.gaps > 0) parts.push(plural(progress.gaps, 'gap', 'gaps'));
  if (progress.carriedOver > 0) parts.push(`${progress.carriedOver} carried over`);
  parts.push(`${progress.approved} approved`);
  if (progress.corrected > 0) parts.push(`${progress.corrected} corrected`);
  return parts.join(' · ');
}
