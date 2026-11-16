import badges from '../Badge.module.css';
import styles from './Settings.module.css';

function SparkIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="m6.3 6.3 2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" />
    </svg>
  );
}

/** Title of the settings card and whether extraction can run (text label, not colour alone). */
export function SettingsCardHeader({ configured }: { configured: boolean }) {
  return (
    <header className={styles.cardHead}>
      <span className={styles.cardIcon} aria-hidden="true">
        <SparkIcon />
      </span>
      <div className={styles.cardHeading}>
        <h2 id="llm-settings-title" className={styles.cardTitle}>
          LLM for extraction
        </h2>
        <p className={styles.intro}>
          Reads uploaded PDFs. Every value it returns is still checked against the document text.
        </p>
      </div>
      <span className={`${badges.badge} ${configured ? badges.extracted : badges.pending}`}>
        <span className={badges.dot} aria-hidden="true" />
        {configured ? 'Configured' : 'Not configured'}
      </span>
    </header>
  );
}
