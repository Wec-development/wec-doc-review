import type { ReactNode } from 'react';
import { useInView } from '../../hooks/useInView.js';
import styles from './Onboarding.module.css';

interface StepCardProps {
  number: number;
  title: string;
  /** The full text explanation; the snippet below only illustrates it. */
  description: ReactNode;
  /** Illustration; `play` is true once its micro-animation should run. */
  snippet: (play: boolean) => ReactNode;
  animate: boolean;
}

/** One numbered step of the flow; reveals (and plays its snippet) when it enters the viewport. */
export function StepCard({ number, title, description, snippet, animate }: StepCardProps) {
  const [ref, inView] = useInView<HTMLLIElement>();
  const className = [styles.step, animate && styles.animate, inView && styles.inView]
    .filter(Boolean)
    .join(' ');
  const headingId = `step-${number}-title`;
  return (
    <li
      ref={ref}
      className={className}
      aria-labelledby={headingId}
      data-animate={animate || undefined}
    >
      <div className={styles.stepHead}>
        <span className={styles.number} aria-hidden="true">
          {number}
        </span>
        <h2 id={headingId} className={styles.stepTitle}>
          <span className="visually-hidden">Step {number}: </span>
          {title}
        </h2>
      </div>
      <p className={styles.stepText}>{description}</p>
      <div className={styles.snippet} aria-hidden="true">
        {snippet(animate && inView)}
      </div>
    </li>
  );
}
