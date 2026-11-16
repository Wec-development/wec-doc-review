import type { ExtractedValue } from '@doc-review/shared';
import { formatValue } from '../lib/format-value.js';
import buttons from '../styles/buttons.module.css';
import { CorrectionForm } from './CorrectionForm.js';
import type { ReviewActions, ValueDisplay } from './review-actions.js';
import { ReviewBadge } from './ReviewBadge.js';
import { RowValue } from './RowValue.js';
import styles from './Values.module.css';

interface ReviewedRowProps {
  value: ExtractedValue;
  display: ValueDisplay;
  /** Omitted for read-only (older) versions: no actions at all. */
  actions?: ReviewActions;
}

/**
 * A value that already has a decision on this version (or any value of an older version, read
 * only). "Change review" adds a new review; earlier reviews are kept.
 */
export function ReviewedRow({ value, display, actions }: ReviewedRowProps) {
  const changing = actions !== undefined && actions.editingId === value.id;
  const formatted = formatValue(display.kind, value.value, value.normalizedValue);
  const error = actions?.errorFor(value.id) ?? null;

  return (
    <div className={styles.row}>
      <div className={styles.rowField}>{value.field}</div>
      <RowValue value={value} formatted={formatted} />
      <div className={styles.rowQuote}>
        {value.evidence ? `“${value.evidence}”` : (value.gapReason ?? '')}
      </div>
      <ReviewBadge value={value} />
      {actions && !changing && (
        <button
          type="button"
          className={`${buttons.secondary} ${buttons.small}`}
          disabled={actions.busy}
          onClick={() => actions.startEditing(value.id)}
          aria-label={`Change review of ${value.field}`}
        >
          Change review
        </button>
      )}
      {error && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
      {actions && changing && (
        <div className={styles.rowEditor}>
          <div className={`${buttons.row} ${styles.actions}`}>
            <button
              type="button"
              className={buttons.approve}
              disabled={actions.busy}
              onClick={() => actions.submit(value, { action: 'approve' })}
              aria-label={`Approve ${value.field} as extracted`}
            >
              Approve as extracted
            </button>
          </div>
          <CorrectionForm
            valueId={value.id}
            initialValue={value.latestReview?.correctedValue ?? value.value ?? ''}
            busy={actions.busy}
            onSubmit={(review) => actions.submit(value, review)}
            onCancel={actions.stopEditing}
          />
        </div>
      )}
    </div>
  );
}
