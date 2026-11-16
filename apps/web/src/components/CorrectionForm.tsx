import { type ReviewRequest, reviewRequestSchema } from '@doc-review/shared';
import { type FormEvent, useState } from 'react';
import buttons from '../styles/buttons.module.css';
import styles from './Values.module.css';

interface CorrectionFormProps {
  valueId: string;
  /** Prefilled with the extracted value (empty for a gap). */
  initialValue: string;
  busy: boolean;
  onSubmit: (review: ReviewRequest) => void;
  onCancel: () => void;
}

interface FieldErrors {
  value?: string;
  note?: string;
}

/** Inline correction; validated with the same shared schema the API uses. */
export function CorrectionForm({
  valueId,
  initialValue,
  busy,
  onSubmit,
  onCancel,
}: CorrectionFormProps) {
  const [value, setValue] = useState(initialValue);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const inputId = `correct-value-${valueId}`;
  const noteId = `correct-note-${valueId}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = reviewRequestSchema.safeParse({
      action: 'correct',
      value,
      note: note.trim() === '' ? undefined : note,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'value') next.value = 'Enter the corrected value.';
        if (issue.path[0] === 'note') next.note = 'Keep the note under 1000 characters.';
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  };

  return (
    <form className={styles.correction} onSubmit={submit} noValidate>
      <div className={styles.formField}>
        <label htmlFor={inputId}>
          Corrected value <span className={styles.required}>*</span>
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          autoFocus
          aria-invalid={errors.value !== undefined}
          aria-describedby={errors.value ? `${inputId}-error` : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        {errors.value && (
          <span id={`${inputId}-error`} className={styles.fieldError} role="alert">
            {errors.value}
          </span>
        )}
      </div>
      <div className={styles.formField}>
        <label htmlFor={noteId}>
          Note <span className={styles.optional}>(optional)</span>
        </label>
        <input
          id={noteId}
          type="text"
          value={note}
          maxLength={1000}
          aria-invalid={errors.note !== undefined}
          onChange={(event) => setNote(event.target.value)}
        />
        {errors.note && (
          <span className={styles.fieldError} role="alert">
            {errors.note}
          </span>
        )}
      </div>
      <p className={styles.helper}>
        The extracted value is kept; your correction is stored beside it.
      </p>
      <div className={buttons.row}>
        <button type="submit" className={buttons.primary} disabled={busy}>
          {busy ? 'Saving…' : 'Save correction'}
        </button>
        <button type="button" className={buttons.secondary} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
