import type { ReviewProgress } from '@doc-review/shared';
import { STATUS_FILTERS, type StatusFilter } from '../lib/status-filter.js';
import styles from './AttentionBanner.module.css';

interface StatusFiltersProps {
  progress: ReviewProgress;
  active: StatusFilter;
  onChange: (filter: StatusFilter) => void;
}

/**
 * The review counts as toggle buttons: pressing one shows only those values below, pressing it
 * again (or "All") shows everything. Text labels carry the status; colour only reinforces it.
 */
export function StatusFilters({ progress, active, onChange }: StatusFiltersProps) {
  return (
    // Polite: screen readers hear the new counts after a review, not on every render.
    <div
      className={styles.filters}
      role="group"
      aria-label="Filter values by status"
      aria-live="polite"
    >
      {STATUS_FILTERS.map((option) => {
        const pressed = option.id === active;
        return (
          <button
            key={option.id}
            type="button"
            className={`${styles.filter} ${styles[option.id] ?? ''} ${pressed ? styles.active : ''}`}
            aria-pressed={pressed}
            onClick={() => onChange(pressed && option.id !== 'all' ? 'all' : option.id)}
          >
            <span className={styles.dot} aria-hidden="true" />
            {option.label(option.count(progress))}
          </button>
        );
      })}
    </div>
  );
}
