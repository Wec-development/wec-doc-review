import { Link } from 'react-router';
import { useLlmSettings } from '../api/queries.js';
import styles from './AttentionBanner.module.css';

/** Shown while no LLM is configured: uploads still work, but extraction waits in the queue. */
export function LlmPausedBanner() {
  const settings = useLlmSettings();
  if (settings.data?.configured !== false) return null;
  return (
    <div className={styles.attention} role="status">
      <p className={styles.message}>
        <strong>Extraction is paused — configure an LLM in Settings.</strong> Uploaded documents
        stay queued until then.
      </p>
      <Link to="/settings">Open Settings</Link>
    </div>
  );
}
