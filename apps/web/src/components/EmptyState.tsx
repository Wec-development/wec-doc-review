import buttons from '../styles/buttons.module.css';
import styles from './States.module.css';
import { UploadIcon } from './UploadIcon.js';

/** Empty documents list (Empty.dc.html). */
export function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <section className={styles.empty} aria-labelledby="empty-title">
      <div className={styles.emptyIcon} aria-hidden="true">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
          <path d="M12 18v-6" />
          <path d="m9 15 3-3 3 3" />
        </svg>
      </div>
      <h2 id="empty-title" className={styles.emptyTitle}>
        No documents yet
      </h2>
      <p className={styles.emptyText}>
        Upload an invoice, lease or market report PDF. Values are extracted in the background, each
        with the exact quote it came from, ready for review.
      </p>
      <button type="button" className={buttons.primary} onClick={onUpload}>
        <UploadIcon />
        Upload PDF
      </button>
    </section>
  );
}
