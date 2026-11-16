import type { PreviousValue as Previous, Review } from '@doc-review/shared';
import styles from './Values.module.css';

function describeReview(review: Review | null): { text: string; className: string } {
  if (!review) return { text: 'Not reviewed', className: styles.muted ?? '' };
  const date = new Date(review.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return review.action === 'correct'
    ? {
        text: `Corrected to “${review.correctedValue ?? ''}” · ${date}`,
        className: styles.correctedText ?? '',
      }
    : { text: `Approved · ${date}`, className: styles.approvedText ?? '' };
}

/** "Previously in v1": the value and review this field had before its evidence changed. */
export function PreviousValue({ previous }: { previous: Previous }) {
  const review = describeReview(previous.latestReview);
  return (
    <div className={styles.previous}>
      <span className={styles.quoteLabel}>Previously in v{previous.versionNo}</span>
      <span className={styles.struck}>
        <span className="visually-hidden">Previous value: </span>
        {previous.value ?? 'No value'}
      </span>
      {previous.evidence && <span className={styles.previousQuote}>“{previous.evidence}”</span>}
      <span className={review.className}>{review.text}</span>
    </div>
  );
}
