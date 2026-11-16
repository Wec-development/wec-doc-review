import type { ListTotals } from '../lib/summary.js';
import styles from './SummaryCards.module.css';

export function SummaryCards({ totals }: { totals: ListTotals }) {
  const cards = [
    { label: 'Needs review', value: totals.needsReview, tone: styles.pending },
    { label: 'Gaps', value: totals.gaps, tone: styles.gap },
    { label: 'Carried over', value: totals.carriedOver, tone: styles.carried },
    { label: 'Approved / corrected', value: totals.reviewed, tone: styles.approved },
  ];
  return (
    <dl className={styles.grid}>
      {cards.map((card) => (
        <div key={card.label} className={styles.card}>
          <dt className={styles.label}>{card.label}</dt>
          <dd className={`${styles.value} ${card.tone}`}>{card.value}</dd>
        </div>
      ))}
    </dl>
  );
}
