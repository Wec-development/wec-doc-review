import type { ExtractedValue, ReviewRequest } from '@doc-review/shared';

/** What the live region announces after a review is saved. */
export function reviewSavedMessage(value: ExtractedValue, review: ReviewRequest): string {
  if (review.action === 'correct') return `Correction saved for ${value.field}`;
  return value.value === null ? `Gap confirmed for ${value.field}` : `Approved ${value.field}`;
}
