import type { ExtractedValue } from '@doc-review/shared';
import type { FormattedValue } from '../lib/format-value.js';
import styles from './Values.module.css';

/**
 * The value column of a row. A corrected value shows the reviewer's value, with the extracted
 * value beside it ("Extracted: …") and the note, so the original is never hidden.
 */
export function RowValue({
  value,
  formatted,
}: {
  value: ExtractedValue;
  formatted: FormattedValue;
}) {
  const review = value.latestReview;
  if (review?.action === 'correct') {
    return (
      <div className={styles.rowValue}>
        <span className={styles.strong}>{review.correctedValue}</span>
        <div className={styles.extracted}>
          Extracted: {value.value ?? 'no value'}
          {review.note ? ` · note: ${review.note}` : ''}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.rowValue}>
      <span className={styles.strong}>{value.value === null ? 'No value' : formatted.text}</span>
      {formatted.unit && <span className={styles.unit}> {formatted.unit}</span>}
    </div>
  );
}
