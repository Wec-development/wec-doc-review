import { CarriedRow } from '../../components/CarriedRow.js';
import { GapCard } from '../../components/GapCard.js';
import type { ReviewActions, ValueDisplay } from '../../components/review-actions.js';
import { ReviewedRow } from '../../components/ReviewedRow.js';
import { ValueCard } from '../../components/ValueCard.js';
import type { GroupedValues } from '../../lib/group-values.js';
import styles from '../Page.module.css';

interface ValueSectionsProps {
  groups: GroupedValues;
  baselineVersionNo: number | null;
  display: (field: string) => ValueDisplay;
  actions: ReviewActions;
}

/** The left column, in the order a reviewer works: needs review, gaps, reviewed, carried over. */
export function ValueSections({ groups, baselineVersionNo, display, actions }: ValueSectionsProps) {
  const { needsReview, gaps, reviewed, carried } = groups;
  const evidenceChanged = needsReview.some((value) => value.comparison === 'changed');
  const nothing = needsReview.length + gaps.length + reviewed.length + carried.length === 0;

  return (
    <section className={styles.valuesColumn} aria-label="Extracted values">
      {nothing && <p className={styles.subtitle}>No values were extracted for this version.</p>}
      {needsReview.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>
            Needs review{evidenceChanged ? ' · evidence changed' : ''}
          </h2>
          {needsReview.map((value) => (
            <ValueCard
              key={value.id}
              value={value}
              display={display(value.field)}
              actions={actions}
            />
          ))}
        </>
      )}
      {gaps.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Gaps · no value found</h2>
          {gaps.map((value) => (
            <GapCard
              key={value.id}
              value={value}
              display={display(value.field)}
              actions={actions}
            />
          ))}
        </>
      )}
      {reviewed.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Reviewed</h2>
          <div className={styles.rows}>
            {reviewed.map((value) => (
              <ReviewedRow
                key={value.id}
                value={value}
                display={display(value.field)}
                actions={actions}
              />
            ))}
          </div>
        </>
      )}
      {carried.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>
            Carried over{baselineVersionNo !== null ? ` from v${baselineVersionNo}` : ''} · evidence
            unchanged
          </h2>
          <div className={styles.rows}>
            {carried.map((value) => (
              <CarriedRow key={value.id} value={value} display={display(value.field)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
