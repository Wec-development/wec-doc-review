import { useId, useState } from 'react';
import buttons from '../../styles/buttons.module.css';
import styles from './Settings.module.css';

interface ApiKeyFieldProps {
  value: string;
  onChange: (apiKey: string) => void;
  /** Last 4 characters of the saved key; set when the saved key is in use. */
  savedHint: string | null;
  /** The form is asking for a new key (none saved, replacing, or another provider). */
  entering: boolean;
  /** A saved key exists for this provider, so "Keep saved key" can undo "Replace key". */
  canKeepSaved: boolean;
  onReplace: () => void;
  onKeepSaved: () => void;
}

/** The key is typed into a password field and never rendered again once saved. */
export function ApiKeyField(props: ApiKeyFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [visible, setVisible] = useState(false);

  if (!props.entering) {
    return (
      <div className={styles.field}>
        <span className={styles.label}>API key</span>
        <div className={styles.savedKey}>
          <span>
            Key saved (<code>…{props.savedHint}</code>)
          </span>
          <button
            type="button"
            className={`${buttons.secondary} ${buttons.small}`}
            onClick={props.onReplace}
          >
            Replace key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        API key
      </label>
      <div className={styles.keyRow}>
        <input
          id={id}
          className={styles.input}
          type={visible ? 'text' : 'password'}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={hintId}
        />
        <button
          type="button"
          className={`${buttons.secondary} ${buttons.small}`}
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? 'Hide API key' : 'Show API key'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
        {props.canKeepSaved && (
          <button
            type="button"
            className={`${buttons.secondary} ${buttons.small}`}
            onClick={props.onKeepSaved}
          >
            Keep saved key
          </button>
        )}
      </div>
      <p id={hintId} className={styles.hint}>
        Stored encrypted on the server and never shown again after saving.
      </p>
    </div>
  );
}
