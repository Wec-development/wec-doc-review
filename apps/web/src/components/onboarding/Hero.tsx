import { useInView } from '../../hooks/useInView.js';
import pageStyles from '../../pages/Page.module.css';
import styles from './Onboarding.module.css';

/** Title and promise of the onboarding page. Fades in once when motion is allowed. */
export function Hero({ animate }: { animate: boolean }) {
  const [ref, inView] = useInView<HTMLElement>();
  const className = [styles.hero, animate && styles.animate, inView && styles.inView]
    .filter(Boolean)
    .join(' ');
  return (
    <header ref={ref} className={className} data-animate={animate || undefined}>
      <p className={styles.eyebrow}>Review Desk</p>
      <h1 className={pageStyles.h1}>How it works</h1>
      <p className={styles.lead}>
        Trustworthy data from your documents — every value backed by its source.
      </p>
      <p className={styles.intro}>
        Five steps take you from choosing an AI model to reviewed values, and keep your reviews when
        a revised version arrives.
      </p>
    </header>
  );
}
