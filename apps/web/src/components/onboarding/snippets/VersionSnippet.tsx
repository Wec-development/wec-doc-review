import badges from '../../Badge.module.css';
import styles from './Snippets.module.css';

/** Invoice v2: a changed value back to pending with v1 beside it, an unchanged one carried over. */
export function VersionSnippet({ play }: { play: boolean }) {
  return (
    <div className={`${styles.frame} ${play ? styles.play : ''}`}>
      <div className={`${styles.row} ${styles.pendingRow}`}>
        <div className={styles.rowHead}>
          <span className={styles.field}>due_date</span>
          <span className={`${badges.badge} ${badges.pending}`}>Pending</span>
        </div>
        <span className={styles.value}>2025-11-13</span>
        <span className={styles.previous}>
          <span className={styles.previousLabel}>Previously in v1</span>
          <span className={styles.struck}>2025-10-14</span>
          <span className={styles.approvedText}>Approved</span>
        </span>
      </div>
      <div className={styles.row}>
        <div className={styles.rowHead}>
          <span className={styles.field}>invoice_number</span>
          <span className={`${badges.badge} ${badges.carried} ${styles.appearLate}`}>
            Carried over · approved
          </span>
        </div>
        <span className={styles.value}>INV-2025-0847</span>
      </div>
    </div>
  );
}
