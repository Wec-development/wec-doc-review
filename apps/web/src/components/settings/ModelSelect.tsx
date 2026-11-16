import type { LlmModelOption } from '@doc-review/shared';
import { useId } from 'react';
import styles from './Settings.module.css';

interface ModelSelectProps {
  /** From the last successful test; null until the key has been tested. */
  options: LlmModelOption[] | null;
  value: string | null;
  onChange: (model: string) => void;
}

/** Models the key can use, recommended (low cost) first; disabled until a test lists them. */
export function ModelSelect({ options, value, onChange }: ModelSelectProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const choices =
    options ?? (value ? [{ id: value, label: 'Saved model', recommended: false }] : []);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        Model
      </label>
      <select
        id={id}
        className={styles.select}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={choices.length === 0}
        aria-describedby={hintId}
      >
        {choices.length === 0 && <option value="">Test the connection to list models</option>}
        {choices.map((option) => (
          <option key={option.id} value={option.id}>
            {option.id} — {option.label}
          </option>
        ))}
      </select>
      <p id={hintId} className={styles.hint}>
        The recommended model is the cheapest one suited to one-page extraction. Higher-accuracy
        models read harder documents better but cost more per document.
      </p>
    </div>
  );
}
