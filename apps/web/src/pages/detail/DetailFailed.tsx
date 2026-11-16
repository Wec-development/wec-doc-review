import buttons from '../../styles/buttons.module.css';
import styles from '../Page.module.css';

interface DetailFailedProps {
  error: string | null;
  retrying: boolean;
  retryError: string | null;
  onRetry: () => void;
  onUploadVersion: () => void;
}

/** Extraction failed: the reason, Retry, or a new version (Failed.dc.html). */
export function DetailFailed({
  error,
  retrying,
  retryError,
  onRetry,
  onUploadVersion,
}: DetailFailedProps) {
  return (
    <section className={styles.failed} role="alert" aria-labelledby="failed-title">
      <div className={styles.failedHead}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--gap-text)"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <path d="M12 16.5v.5" />
        </svg>
        <div>
          <h2 id="failed-title">Extraction failed</h2>
          <p>
            No values were saved for this version. You can retry — nothing already reviewed is
            affected.
          </p>
        </div>
      </div>
      <div className={styles.reason}>
        <div className={styles.reasonLabel}>Reason</div>
        <div>{error ?? 'No reason was recorded.'}</div>
      </div>
      {retryError && <p role="alert">{retryError}</p>}
      <div className={buttons.row}>
        <button type="button" className={buttons.primary} onClick={onRetry} disabled={retrying}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
          {retrying ? 'Retrying…' : 'Retry extraction'}
        </button>
        <button type="button" className={buttons.secondary} onClick={onUploadVersion}>
          Upload new version
        </button>
      </div>
    </section>
  );
}
