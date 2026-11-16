import badges from '../../Badge.module.css';
import styles from './Snippets.module.css';

/** A value beside its source quote, with approve / correct; a correction sits beside the original. */
export function ReviewSnippet({ play }: { play: boolean }) {
  return (
    <div className={`${styles.frame} ${play ? styles.play : ''}`}>
      <div className={`${styles.row} ${styles.pendingRow}`}>
        <div className={styles.rowHead}>
          <span className={styles.field}>vendor_name</span>
          <span className={`${badges.badge} ${styles.pill} ${badges.pending}`}>Pending</span>
        </div>
        <span className={styles.value}>MERIDIAN OFFICE SUPPLIES LLC</span>
        <span className={styles.quote}>
          <span className={styles.mark}>MERIDIAN OFFICE SUPPLIES LLC</span>
        </span>
        <span className={styles.actions}>
          <span className={`${styles.fakeButton} ${styles.fakePrimary}`}>Approve</span>
          <span className={styles.fakeButton}>Correct…</span>
        </span>
      </div>
      <div className={`${styles.row} ${styles.appearLate}`}>
        <div className={styles.rowHead}>
          <span className={styles.field}>vendor_name</span>
          <span className={`${badges.badge} ${styles.pill} ${badges.corrected}`}>Corrected</span>
        </div>
        <span className={styles.value}>Meridian Office Supplies, LLC</span>
        <span className={styles.corrected}>
          Extracted: <span className={styles.struck}>MERIDIAN OFFICE SUPPLIES LLC</span>
        </span>
      </div>
    </div>
  );
}
