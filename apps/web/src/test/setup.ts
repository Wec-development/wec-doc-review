import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { markOnboardingSeen } from '../hooks/useFirstVisit.js';

afterEach(() => {
  cleanup();
});

// jsdom has no layout engine; scrolling a highlight into view is a no-op in tests.
Element.prototype.scrollIntoView = function scrollIntoView() {};

// Most tests start on the documents list; onboarding tests reset this to simulate a first visit.
beforeEach(() => {
  markOnboardingSeen();
});

// jsdom has no matchMedia; default to "no reduced-motion preference". Tests can override it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) satisfies MediaQueryList;
}
