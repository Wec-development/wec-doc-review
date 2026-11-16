import type { VersionStatus } from '@doc-review/shared';
import styles from './Extracting.module.css';

/** The sticky status line while a version waits for, or goes through, extraction. */
export function ExtractionBanner({
  status,
  versionNo,
}: {
  status: VersionStatus;
  versionNo: number;
}) {
  const extracting = status === 'extracting';
  return (
    <section className={styles.banner} aria-label="Extraction status">
      <svg
        className={styles.spinner}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="var(--surface)" />
        <path d="M21 12a9 9 0 0 0-9-9" />
      </svg>
      <p className={styles.bannerText} role="status">
        <strong>
          {extracting
            ? `Extracting values from v${versionNo}…`
            : `Waiting to extract v${versionNo}…`}
        </strong>
      </p>
      <span className={styles.bannerNote}>Updates automatically every 3 s</span>
    </section>
  );
}
