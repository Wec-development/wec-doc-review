import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  resetOnboardingSeen,
} from '../hooks/useFirstVisit.js';
import { mockedApi } from '../test/mock-api.js';
import { renderApp } from '../test/render.js';

vi.mock('../api/client.js', async (importOriginal) =>
  (await import('../test/api-mock-factory.js')).apiModuleMock(importOriginal),
);
const api = mockedApi();

const STEP_TITLES = ['Configure an LLM', 'Upload a PDF', 'Extraction', 'Review', 'New versions'];

beforeEach(() => {
  vi.resetAllMocks();
  api.listDocuments.mockResolvedValue({ documents: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function expectDocumentsPage() {
  expect(await screen.findByRole('heading', { level: 1, name: 'Documents' })).toBeInTheDocument();
}

async function expectWelcomePage() {
  expect(
    await screen.findByRole('heading', { level: 1, name: 'How it works' }),
  ).toBeInTheDocument();
}

/** Simulates the OS "reduce motion" setting for the next render. */
function preferReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) satisfies MediaQueryList,
  );
}

describe('first visit', () => {
  it('redirects / to /welcome once, then goes straight to the documents', async () => {
    resetOnboardingSeen();

    const first = renderApp('/');
    await expectWelcomePage();
    expect(hasSeenOnboarding()).toBe(true);
    first.unmount();

    renderApp('/');
    await expectDocumentsPage();
  });

  it('does not redirect (or crash) when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    renderApp('/');
    await expectDocumentsPage();
    expect(() => markOnboardingSeen()).not.toThrow();
  });

  it('still shows the onboarding when it cannot be remembered', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    renderApp('/welcome');
    await expectWelcomePage();
  });
});

describe('leaving and reopening the onboarding', () => {
  it.each(['Skip — go to documents', 'Go to documents'])(
    '"%s" goes to the documents and marks the onboarding as seen',
    async (name) => {
      resetOnboardingSeen();
      const { user } = renderApp('/welcome');
      await expectWelcomePage();

      await user.click(screen.getByRole('link', { name }));

      await expectDocumentsPage();
      expect(hasSeenOnboarding()).toBe(true);
    },
  );

  it('opens from the header "How it works" link at any time', async () => {
    const { user } = renderApp('/');
    await expectDocumentsPage();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    await user.click(within(nav).getByRole('link', { name: 'How it works' }));

    await expectWelcomePage();
  });

  it('puts the skip link before the steps, so it is reached first by keyboard', async () => {
    const { user } = renderApp('/welcome');
    await expectWelcomePage();
    const main = screen.getByRole('main');

    // Header links come first; the first thing focused inside the page is the skip link.
    while (!main.contains(document.activeElement)) await user.tab();

    expect(document.activeElement).toBe(
      within(main).getByRole('link', { name: 'Skip — go to documents' }),
    );
  });
});

describe('content', () => {
  it('shows one h1, the promise, and the five steps in order with their headings', async () => {
    renderApp('/welcome');
    await expectWelcomePage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByText(/every value backed by its source/, { selector: 'p' }),
    ).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'How it works, step by step' });
    const steps = within(list).getAllByRole('listitem');
    expect(
      steps.map((step) => within(step).getByRole('heading', { level: 2 }).textContent),
    ).toEqual(STEP_TITLES.map((title, index) => `Step ${index + 1}: ${title}`));
    expect(document.title).toBe('How it works · Review Desk');
  });

  it('describes each step in text and hides the illustrations from assistive tech', async () => {
    renderApp('/welcome');
    await expectWelcomePage();

    expect(screen.getByText(/the field becomes a gap with a reason/)).toBeInTheDocument();
    expect(screen.getByText(/marked carried over/)).toBeInTheDocument();
    // Snippet text (fixture values) is decorative: not exposed to the accessibility tree.
    expect(screen.queryByText('Total Due: $5,230.29')).toBeInTheDocument();
    expect(screen.getByText('Total Due: $5,230.29').closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('motion', () => {
  it('animates the hero and steps when motion is allowed', async () => {
    preferReducedMotion(false);
    const { container } = renderApp('/welcome');
    await expectWelcomePage();

    expect(container.querySelectorAll('[data-animate]')).toHaveLength(6);
    expect(container.querySelectorAll('[class*="animate"]')).toHaveLength(6);
    expect(container.querySelectorAll('[class*="play"]')).toHaveLength(5);
  });

  it('applies no animation at all with prefers-reduced-motion: reduce', async () => {
    preferReducedMotion(true);
    const { container } = renderApp('/welcome');
    await expectWelcomePage();

    expect(container.querySelectorAll('[data-animate]')).toHaveLength(0);
    expect(container.querySelector('[class*="animate"], [class*="play"]')).toBeNull();
  });
});
