import { useEffect } from 'react';
import { Link } from 'react-router';
import { Hero } from '../components/onboarding/Hero.js';
import styles from '../components/onboarding/Onboarding.module.css';
import { StepFlow } from '../components/onboarding/StepFlow.js';
import { markOnboardingSeen } from '../hooks/useFirstVisit.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import buttons from '../styles/buttons.module.css';
import pageStyles from './Page.module.css';

/**
 * "How it works": the four steps from upload to carried-over reviews. Shown once on the first
 * visit and reachable from the header; always skippable, nothing auto-advances.
 */
export function WelcomePage() {
  usePageTitle('How it works');
  const animate = !usePrefersReducedMotion();

  // Seen as soon as it is shown, so the redirect from / happens at most once.
  useEffect(() => {
    markOnboardingSeen();
  }, []);

  return (
    <main className={pageStyles.main}>
      <div className={styles.skipRow}>
        <Link to="/" className={styles.skip} onClick={markOnboardingSeen}>
          Skip — go to documents
        </Link>
      </div>
      <Hero animate={animate} />
      <StepFlow animate={animate} />
      <section className={styles.cta} aria-labelledby="welcome-cta-title">
        <div>
          <h2 id="welcome-cta-title" className={styles.stepTitle}>
            Ready to review
          </h2>
          <p className={styles.ctaText}>
            Three sample documents are already loaded. Open one to see its values, quotes and gaps,
            or upload your own PDF.
          </p>
        </div>
        <Link to="/" className={buttons.primary} onClick={markOnboardingSeen}>
          Go to documents
        </Link>
      </section>
    </main>
  );
}
