import type { ExtractedValue } from '@doc-review/shared';

export interface GroupedValues {
  /** Values awaiting a decision, with a value to check. */
  needsReview: ExtractedValue[];
  /** Fields with no value awaiting a decision (confirm the gap or enter a value). */
  gaps: ExtractedValue[];
  /** Approved or corrected on this version. */
  reviewed: ExtractedValue[];
  /** Review carried over from the previous version (evidence unchanged). */
  carried: ExtractedValue[];
}

/**
 * Groups values in the order a reviewer works through them: needs review, gaps, reviewed,
 * carried over. Within each group the API's field order is kept.
 */
export function groupValues(values: readonly ExtractedValue[]): GroupedValues {
  const groups: GroupedValues = { needsReview: [], gaps: [], reviewed: [], carried: [] };
  for (const value of values) {
    if (value.reviewState === 'carried_over') groups.carried.push(value);
    else if (value.reviewState === 'approved' || value.reviewState === 'corrected')
      groups.reviewed.push(value);
    else if (value.value === null) groups.gaps.push(value);
    else groups.needsReview.push(value);
  }
  return groups;
}

/** Values that still need a human decision (pending values and pending gaps). */
export function countAwaitingReview(values: readonly ExtractedValue[]): number {
  return values.filter((value) => value.reviewState === 'pending').length;
}
