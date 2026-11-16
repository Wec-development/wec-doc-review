import type { ListTotals } from '../lib/summary.js';
import styles from './SummaryCards.module.css';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function SummaryCards({ totals }: { totals: ListTotals }) {
  const cards = [
    {
      label: 'Values to review',
      value: totals.needsReview,
      tone: styles.pending,
      // Values, not documents: say how many documents they are spread over.
      note:
        totals.needsReview > 0
          ? `in ${plural(totals.documentsNeedingReview, 'document', 'documents')}`
          : null,
    },
    { label: 'Gaps', value: totals.gaps, tone: styles.gap, note: null },
    { label: 'Carried over', value: totals.carriedOver, tone: styles.carried, note: null },
    { label: 'Approved / corrected', value: totals.reviewed, tone: styles.approved, note: null },
  ];
  return (
    <dl className={styles.grid}>
      {cards.map((card) => (
        <div key={card.label} className={styles.card}>
          <dt className={styles.label}>{card.label}</dt>
          <dd className={`${styles.value} ${card.tone}`}>
            {card.value}
            {card.note && <span className={styles.note}> {card.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
