import type { ExtractedValue } from '@doc-review/shared';
import { formatValue } from '../lib/format-value.js';
import type { ValueDisplay } from './review-actions.js';
import { ReviewBadge } from './ReviewBadge.js';
import { RowValue } from './RowValue.js';
import styles from './Values.module.css';

/** A value whose review carried over from the previous version: read-only, no actions. */
export function CarriedRow({ value, display }: { value: ExtractedValue; display: ValueDisplay }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowField}>{value.field}</div>
      <RowValue
        value={value}
        formatted={formatValue(display.kind, value.value, value.normalizedValue)}
      />
      <div className={styles.rowQuote}>
        {value.evidence ? `“${value.evidence}”` : (value.gapReason ?? '')}
      </div>
      <ReviewBadge value={value} />
    </div>
  );
}
