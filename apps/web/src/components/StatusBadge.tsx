import type { VersionStatus } from '@doc-review/shared';
import { statusMeta } from '../lib/status.js';
import styles from './Badge.module.css';

interface StatusBadgeProps {
  status: VersionStatus;
  /** Viewing an older version: shown as "Superseded". */
  older?: boolean;
}

function StatusIcon({ tone }: { tone: string }) {
  if (tone === 'extracting') {
    return (
      <svg
        className={styles.spin}
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-6.2-8.6" />
      </svg>
    );
  }
  if (tone === 'failed') {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <path d="M12 16.5v.5" />
      </svg>
    );
  }
  return <span className={styles.dot} aria-hidden="true" />;
}

/** Version status as a pill: always a text label, the icon is decoration. */
export function StatusBadge({ status, older = false }: StatusBadgeProps) {
  const meta = statusMeta(status, older);
  return (
    <span className={`${styles.badge} ${styles[meta.tone]}`}>
      <StatusIcon tone={meta.tone} />
      {meta.label}
    </span>
  );
}
