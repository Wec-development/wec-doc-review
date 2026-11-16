import type { DocumentDetail, ReviewProgress } from '@doc-review/shared';
import type { StatusFilter } from '../lib/status-filter.js';
import styles from './AttentionBanner.module.css';
import { StatusFilters } from './StatusFilters.js';

interface AttentionBannerProps {
  detail: DocumentDetail;
  progress: ReviewProgress;
  /** Which values the column below shows; the counts double as the filter buttons. */
  filter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What needs attention, first thing on the page (the 5-second rule). */
export function AttentionBanner({
  detail,
  progress,
  filter,
  onFilterChange,
}: AttentionBannerProps) {
  const baseline = detail.version.baselineVersionNo;
  const changed = detail.values.filter(
    (v) => v.comparison === 'changed' && v.reviewState === 'pending',
  ).length;
  const allReviewed = progress.pending === 0;

  const message = allReviewed ? (
    <>
      <strong>All values reviewed.</strong>
      <span className={styles.detail}> Nothing on this version needs your attention.</span>
    </>
  ) : (
    <>
      <strong>{plural(progress.pending, 'value needs', 'values need')} your review.</strong>
      {/* The explanation is dropped on narrow screens, where the bar stays one line. */}
      <span className={styles.detail}>
        {baseline !== null &&
          changed > 0 &&
          ` Their evidence changed in v${detail.version.versionNo}.`}
        {baseline !== null &&
          progress.carriedOver > 0 &&
          ` The other ${progress.carriedOver} kept their v${baseline} review and are marked carried over.`}
      </span>
    </>
  );

  return (
    <section className={allReviewed ? styles.calm : styles.attention} aria-label="Review summary">
      <div className={styles.message}>{message}</div>
      <StatusFilters progress={progress} active={filter} onChange={onFilterChange} />
    </section>
  );
}
