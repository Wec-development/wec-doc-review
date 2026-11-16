import { useState } from 'react';

const SEEN_KEY = 'review-desk:onboarding-seen';

/**
 * Whether this browser has seen the onboarding. When storage is unavailable (private mode,
 * blocked site data) it reports true, so the documents list is never blocked by a redirect.
 */
export function hasSeenOnboarding(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return true;
  }
}

/** Remembers that the onboarding was shown. Storage failures are ignored: it is a convenience. */
export function markOnboardingSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Without storage the onboarding is simply not remembered; nothing else depends on it.
  }
}

/** For tests: forget the onboarding so the next visit to `/` is a first visit. */
export function resetOnboardingSeen(): void {
  try {
    window.localStorage.removeItem(SEEN_KEY);
  } catch {
    // Nothing to reset when storage is unavailable.
  }
}

/** True when this is the browser's first visit (read once per mount, never re-evaluated). */
export function useFirstVisit(): boolean {
  const [firstVisit] = useState(() => !hasSeenOnboarding());
  return firstVisit;
}
