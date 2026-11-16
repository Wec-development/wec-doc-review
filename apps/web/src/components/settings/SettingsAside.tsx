import type { LlmProvider } from '@doc-review/shared';
import { LLM_PROVIDER_LABELS } from '@doc-review/shared';
import styles from './Settings.module.css';

interface SettingsAsideProps {
  /** Set right after a save in this visit: confirms which key is now in use. */
  justSaved: { keyHint: string | null } | null;
  provider: LlmProvider;
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

/** Side panel: save confirmation, what Save does with the key, and the no-sign-in caveat. */
export function SettingsAside({ justSaved, provider }: SettingsAsideProps) {
  return (
    <aside className={styles.aside} aria-label="About these settings">
      {justSaved && (
        <p className={styles.savedBanner}>
          <CheckIcon />
          <span>
            Saved · key ending in <code>{justSaved.keyHint}</code>. Used from the next document.
          </span>
        </p>
      )}
      <section className={styles.asideCard} aria-labelledby="on-save-title">
        <h2 id="on-save-title" className={styles.asideTitle}>
          What happens on Save
        </h2>
        <ul className={styles.asideList}>
          <li>The key is sent once to the API.</li>
          <li>The API checks it again with {LLM_PROVIDER_LABELS[provider]}.</li>
          <li>It is encrypted (AES-256-GCM) and stored in the database.</li>
          <li>Only its last 4 characters are ever shown again.</li>
          <li>Queued documents start extracting on the next poll.</li>
        </ul>
      </section>
      <section className={styles.warningCard} aria-labelledby="no-auth-title">
        <h2 id="no-auth-title" className={styles.warningTitle}>
          <ShieldIcon />
          No sign-in in this app
        </h2>
        <ul className={styles.asideList}>
          <li>Anyone who can open the app can change these settings.</li>
          <li>A production deployment would require sign-in and an admin role.</li>
        </ul>
      </section>
    </aside>
  );
}
