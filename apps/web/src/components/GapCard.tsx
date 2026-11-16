import type { ExtractedValue } from '@doc-review/shared';
import buttons from '../styles/buttons.module.css';
import { CorrectionForm } from './CorrectionForm.js';
import { PreviousValue } from './PreviousValue.js';
import type { ReviewActions, ValueDisplay } from './review-actions.js';
import { ReviewBadge } from './ReviewBadge.js';
import styles from './Values.module.css';

interface GapCardProps {
  value: ExtractedValue;
  display: ValueDisplay;
  actions: ReviewActions;
}

/** A field with no value: always shown with its reason; confirm it or enter the value. */
export function GapCard({ value, display, actions }: GapCardProps) {
  const editing = actions.editingId === value.id;
  const error = actions.errorFor(value.id);
  const headingId = `value-${value.id}`;

  return (
    <article
      className={`${styles.card} ${editing ? styles.cardEditing : styles.cardGap}`}
      aria-labelledby={headingId}
    >
      <div className={styles.cardHead}>
        <div>
          <h3 id={headingId} className={styles.fieldName}>
            {value.field} · {display.kind}
          </h3>
          <div className={`${styles.bigValue} ${styles.noValue}`}>No value</div>
        </div>
        <ReviewBadge
          value={value}
          {...(editing ? { label: 'Correcting', tone: 'corrected' as const } : {})}
        />
      </div>
      <div className={styles.reasonBox}>
        <div className={styles.quoteLabel}>Reason</div>
        {value.gapReason ?? 'No reason was given.'}
      </div>
      {value.comparison === 'changed' && value.previous && (
        <PreviousValue previous={value.previous} />
      )}
      {error && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
      {editing ? (
        <CorrectionForm
          valueId={value.id}
          initialValue=""
          busy={actions.busy}
          onSubmit={(review) => actions.submit(value, review)}
          onCancel={actions.stopEditing}
        />
      ) : (
        <div className={`${buttons.row} ${styles.actions}`}>
          <button
            type="button"
            className={buttons.secondary}
            disabled={actions.busy}
            onClick={() => actions.submit(value, { action: 'approve' })}
            aria-label={`Confirm gap for ${value.field}`}
          >
            Confirm gap
          </button>
          <button
            type="button"
            className={buttons.secondary}
            disabled={actions.busy}
            onClick={() => actions.startEditing(value.id)}
            aria-label={`Enter value for ${value.field}`}
          >
            Enter value…
          </button>
        </div>
      )}
    </article>
  );
}
