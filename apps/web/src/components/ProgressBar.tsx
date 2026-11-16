import type { ReviewProgress } from '@doc-review/shared';
import { progressLine } from '../lib/summary.js';
import styles from './ProgressBar.module.css';

const SEGMENTS = [
  ['carriedOver', styles.carried],
  ['approved', styles.approved],
  ['corrected', styles.corrected],
  ['pending', styles.pending],
] as const;

/** Review progress: a stacked bar (decorative) and the same counts as text. */
export function ProgressBar({ progress }: { progress: ReviewProgress }) {
  const total = Math.max(progress.total, 1);
  return (
    <div>
      <div className={styles.track} aria-hidden="true">
        {SEGMENTS.map(([key, className]) =>
          progress[key] > 0 ? (
            <div
              key={key}
              className={className}
              style={{ width: `${(progress[key] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className={styles.counts}>
        {progress.pending > 0 ? (
          <strong className={styles.pendingText}>{progressLine(progress)}</strong>
        ) : (
          progressLine(progress)
        )}
      </div>
    </div>
  );
}
