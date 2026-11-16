import type { DocumentDetail, ReviewProgress } from '@doc-review/shared';
import styles from './AttentionBanner.module.css';

interface AttentionBannerProps {
  detail: DocumentDetail;
  progress: ReviewProgress;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What needs attention, first thing on the page (the 5-second rule). */
export function AttentionBanner({ detail, progress }: AttentionBannerProps) {
  const baseline = detail.version.baselineVersionNo;
  const changed = detail.values.filter(
    (v) => v.comparison === 'changed' && v.reviewState === 'pending',
  ).length;
  const allReviewed = progress.pending === 0;

  const message = allReviewed ? (
    <>
      <strong>All values reviewed.</strong> Nothing on this version needs your attention.
    </>
  ) : (
    <>
      <strong>{plural(progress.pending, 'value needs', 'values need')} your review.</strong>
      {baseline !== null &&
        changed > 0 &&
        ` Their evidence changed in v${detail.version.versionNo}.`}
      {baseline !== null &&
        progress.carriedOver > 0 &&
        ` The other ${progress.carriedOver} kept their v${baseline} review and are marked carried over.`}
    </>
  );

  return (
    <section className={allReviewed ? styles.calm : styles.attention} aria-label="Review summary">
      <div className={styles.message}>{message}</div>
      <ul className={styles.counts}>
        <li className={styles.pending}>{progress.pending} pending</li>
        <li className={styles.gap}>{plural(progress.gaps, 'gap', 'gaps')}</li>
        <li className={styles.carried}>{progress.carriedOver} carried over</li>
        <li className={styles.approved}>{progress.approved} approved</li>
        <li className={styles.corrected}>{progress.corrected} corrected</li>
      </ul>
    </section>
  );
}
