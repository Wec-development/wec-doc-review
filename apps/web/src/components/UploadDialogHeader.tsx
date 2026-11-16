import type { UploadMode } from './UploadDialog.js';
import styles from './UploadDialog.module.css';

/** Title, a one-line explanation (it describes the dialog) and the close button. */
export function UploadDialogHeader({ mode, onClose }: { mode: UploadMode; onClose: () => void }) {
  return (
    <header className={styles.head}>
      <div>
        <h2 id="upload-title" className={styles.title}>
          {mode.kind === 'version' ? 'Upload a new version' : 'Upload documents'}
        </h2>
        <p id="upload-intro" className={styles.subtitle}>
          {mode.kind === 'version' ? (
            <>
              New version of <strong>{mode.title}</strong>. Unchanged values keep their review.
            </>
          ) : (
            'Each PDF becomes its own document. Extraction runs in the background.'
          )}
        </p>
      </div>
      <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </header>
  );
}
