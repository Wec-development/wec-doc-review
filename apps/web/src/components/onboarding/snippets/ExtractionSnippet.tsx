import badges from '../../Badge.module.css';
import styles from './Snippets.module.css';

/** Status goes Queued → Extracting → Extracted once; a quoted value and a gap with its reason. */
export function ExtractionSnippet({ play }: { play: boolean }) {
  return (
    <div className={`${styles.frame} ${play ? styles.play : ''}`}>
      <span className={styles.statusStack}>
        <span
          className={`${badges.badge} ${badges.queued} ${styles.statusPast} ${styles.statusQueued}`}
        >
          <span className={badges.dot} />
          Queued
        </span>
        <span
          className={`${badges.badge} ${badges.extracting} ${styles.statusPast} ${styles.statusExtracting}`}
        >
          <span className={badges.dot} />
          Extracting
        </span>
        <span className={`${badges.badge} ${badges.extracted} ${styles.statusExtracted}`}>
          <span className={badges.dot} />
          Extracted
        </span>
      </span>
      <div className={styles.row}>
        <span className={styles.field}>total_amount</span>
        <span className={styles.value}>$5,230.29</span>
        <span className={styles.quote}>
          <span className={styles.mark}>Total Due: $5,230.29</span>
        </span>
      </div>
      <div className={`${styles.row} ${styles.gapRow}`}>
        <div className={styles.rowHead}>
          <span className={styles.field}>median_household_income</span>
          <span className={`${badges.badge} ${badges.gap}`}>Gap</span>
        </div>
        <span className={styles.reason}>The report does not state median household income.</span>
      </div>
    </div>
  );
}
