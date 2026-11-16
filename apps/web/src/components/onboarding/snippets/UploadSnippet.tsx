import badges from '../../Badge.module.css';
import { UploadIcon } from '../../UploadIcon.js';
import styles from './Snippets.module.css';

/** A drop zone with the chosen file and type; the new document appears as Queued. */
export function UploadSnippet({ play }: { play: boolean }) {
  return (
    <div className={`${styles.frame} ${play ? styles.play : ''}`}>
      <div className={styles.dropzone}>
        <UploadIcon />
        <span>Drop a PDF or choose a file</span>
      </div>
      <div className={`${styles.chips} ${styles.appear}`}>
        <span className={styles.chip}>invoice-001.pdf</span>
        <span className={styles.chip}>Invoice</span>
        <span className={`${badges.badge} ${styles.pill} ${badges.queued}`}>
          <span className={badges.dot} />
          Queued
        </span>
      </div>
    </div>
  );
}
