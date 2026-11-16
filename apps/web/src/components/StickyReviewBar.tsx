import type { DocumentDetail, ReviewProgress } from '@doc-review/shared';
import type { StatusFilter } from '../lib/status-filter.js';
import { AttentionBanner } from './AttentionBanner.js';
import { StickyBar } from './StickyBar.js';

/** The review summary and status filters, stuck below the header while the values scroll. */
export function StickyReviewBar(props: {
  detail: DocumentDetail;
  progress: ReviewProgress;
  filter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
}) {
  return (
    <StickyBar>
      <AttentionBanner {...props} />
    </StickyBar>
  );
}
