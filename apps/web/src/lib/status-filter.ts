import type { ExtractedValue, ReviewProgress } from '@doc-review/shared';

export type StatusFilter = 'all' | 'pending' | 'gaps' | 'carried' | 'approved' | 'corrected';

export interface StatusFilterOption {
  id: StatusFilter;
  /** Button text for a count, e.g. "4 pending", "1 gap". */
  label: (count: number) => string;
  count: (progress: ReviewProgress) => number;
  /** Same rule the API uses for the count, so a filter shows exactly that many values. */
  matches: (value: ExtractedValue) => boolean;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** In the order of the summary bar. Gaps count in addition to their review state. */
export const STATUS_FILTERS: readonly StatusFilterOption[] = [
  {
    id: 'all',
    label: (count) => `All ${count}`,
    count: (progress) => progress.total,
    matches: () => true,
  },
  {
    id: 'pending',
    label: (count) => `${count} pending`,
    count: (progress) => progress.pending,
    matches: (value) => value.reviewState === 'pending',
  },
  {
    id: 'gaps',
    label: (count) => plural(count, 'gap', 'gaps'),
    count: (progress) => progress.gaps,
    matches: (value) => value.value === null,
  },
  {
    id: 'carried',
    label: (count) => `${count} carried over`,
    count: (progress) => progress.carriedOver,
    matches: (value) => value.reviewState === 'carried_over',
  },
  {
    id: 'approved',
    label: (count) => `${count} approved`,
    count: (progress) => progress.approved,
    matches: (value) => value.reviewState === 'approved',
  },
  {
    id: 'corrected',
    label: (count) => `${count} corrected`,
    count: (progress) => progress.corrected,
    matches: (value) => value.reviewState === 'corrected',
  },
];

export function filterValues(
  values: readonly ExtractedValue[],
  filter: StatusFilter,
): ExtractedValue[] {
  const option = STATUS_FILTERS.find((candidate) => candidate.id === filter);
  return option ? values.filter(option.matches) : [...values];
}

/** What to say when a filter matches nothing, e.g. "No corrected values on this version." */
export function emptyFilterMessage(filter: StatusFilter): string {
  switch (filter) {
    case 'pending':
      return 'Nothing is pending on this version.';
    case 'gaps':
      return 'No gaps on this version: every field has a value.';
    case 'carried':
      return 'No values were carried over to this version.';
    case 'approved':
      return 'No approved values on this version yet.';
    case 'corrected':
      return 'No corrected values on this version yet.';
    case 'all':
      return 'No values were extracted for this version.';
  }
}
