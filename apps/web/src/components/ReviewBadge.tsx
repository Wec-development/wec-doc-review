import type { ExtractedValue } from '@doc-review/shared';
import { reviewMeta, type ReviewTone } from '../lib/status.js';
import styles from './Badge.module.css';

interface ReviewBadgeProps {
  value: ExtractedValue;
  /** Overrides the derived label, e.g. "Correcting" while the form is open. */
  label?: string;
  tone?: ReviewTone;
}

/** A value's review state as a labelled pill (never colour alone). */
export function ReviewBadge({ value, label, tone }: ReviewBadgeProps) {
  const meta = reviewMeta(value);
  return (
    <span className={`${styles.badge} ${styles[tone ?? meta.tone]}`}>{label ?? meta.label}</span>
  );
}
