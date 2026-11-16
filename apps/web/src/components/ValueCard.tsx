import type { ExtractedValue } from '@doc-review/shared';
import { formatValue } from '../lib/format-value.js';
import buttons from '../styles/buttons.module.css';
import { CorrectionForm } from './CorrectionForm.js';
import { EvidenceQuote } from './EvidenceQuote.js';
import { PreviousValue } from './PreviousValue.js';
import type { ReviewActions, ValueDisplay } from './review-actions.js';
import { ReviewBadge } from './ReviewBadge.js';
import styles from './Values.module.css';

interface ValueCardProps {
  value: ExtractedValue;
  display: ValueDisplay;
  actions: ReviewActions;
}

/** A value that needs a decision: value, source quote, previous version (if changed), actions. */
export function ValueCard({ value, display, actions }: ValueCardProps) {
  const formatted = formatValue(display.kind, value.value, value.normalizedValue);
  const editing = actions.editingId === value.id;
  const error = actions.errorFor(value.id);
  const headingId = `value-${value.id}`;

  return (
    <article
      className={`${styles.card} ${editing ? styles.cardEditing : styles.cardPending}`}
      aria-labelledby={headingId}
    >
      <div className={styles.cardHead}>
        <div>
          <h3 id={headingId} className={styles.fieldName}>
            {value.field} · {display.kind}
          </h3>
          <div className={styles.bigValue}>
            {formatted.text}
            {formatted.unit && <span className={styles.unit}> {formatted.unit}</span>}
          </div>
        </div>
        <ReviewBadge
          value={value}
          {...(editing ? { label: 'Correcting', tone: 'corrected' as const } : {})}
        />
      </div>
      <EvidenceQuote
        value={value}
        versionNo={display.versionNo}
        parsedText={display.parsedText}
        onShow={() => actions.showInText(value.id)}
      />
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
          initialValue={value.value ?? ''}
          busy={actions.busy}
          onSubmit={(review) => actions.submit(value, review)}
          onCancel={actions.stopEditing}
        />
      ) : (
        <div className={`${buttons.row} ${styles.actions}`}>
          <button
            type="button"
            className={buttons.approve}
            disabled={actions.busy}
            onClick={() => actions.submit(value, { action: 'approve' })}
            aria-label={`Approve ${value.field}`}
          >
            <svg
              width="16"
              height="16"
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
            Approve
          </button>
          <button
            type="button"
            className={buttons.secondary}
            disabled={actions.busy}
            onClick={() => actions.startEditing(value.id)}
            aria-label={`Correct ${value.field}`}
          >
            Correct…
          </button>
        </div>
      )}
    </article>
  );
}
