import type { VersionStatus } from '@doc-review/shared';
import { Skeleton } from '../../components/Skeleton.js';
import styles from '../Page.module.css';

/** Queued or extracting: what is happening, while the page polls (Extracting.dc.html). */
export function DetailExtracting({ status }: { status: VersionStatus }) {
  return (
    <>
      <section className={styles.centred} aria-labelledby="extracting-title">
        <svg
          className={styles.spinner}
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" stroke="var(--corrected-bg)" />
          <path d="M21 12a9 9 0 0 0-9-9" />
        </svg>
        <h2 id="extracting-title">
          {status === 'queued' ? 'Waiting to extract…' : 'Extracting values…'}
        </h2>
        <p>
          This usually takes a few seconds. You can leave this page — extraction keeps running and
          survives restarts.
        </p>
        <p>Updates automatically every 3 s.</p>
      </section>
      <Skeleton rows={3} />
    </>
  );
}
