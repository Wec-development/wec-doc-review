import { LLM_PROVIDER_LABELS, type LlmSettings } from '@doc-review/shared';
import styles from './Settings.module.css';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** What is in use right now (read-only); the key appears only as its last 4 characters. */
export function CurrentSettings({ saved }: { saved: LlmSettings }) {
  if (!saved.configured || !saved.provider) return null;
  return (
    <dl className={styles.summary} aria-label="Current settings">
      <div>
        <dt>Provider</dt>
        <dd>{LLM_PROVIDER_LABELS[saved.provider]}</dd>
      </div>
      <div>
        <dt>Model</dt>
        <dd className={styles.mono}>{saved.model}</dd>
      </div>
      <div>
        <dt>API key</dt>
        <dd className={styles.mono}>
          <span aria-hidden="true">••••••••</span>
          <span className="visually-hidden">ending in </span>
          {saved.keyHint}
        </dd>
      </div>
      <div>
        <dt>Last verified</dt>
        <dd>{formatDate(saved.lastVerifiedAt)}</dd>
      </div>
    </dl>
  );
}
