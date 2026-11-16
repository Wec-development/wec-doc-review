import type { DocumentDetail } from '@doc-review/shared';
import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoiceV2Detail, makeProgress, makeReview } from '../test/factories.js';
import { mockedApi } from '../test/mock-api.js';
import { renderApp } from '../test/render.js';

vi.mock('../api/client.js', async (importOriginal) =>
  (await import('../test/api-mock-factory.js')).apiModuleMock(importOriginal),
);
const api = mockedApi();

/** A viewport for matchMedia: wide (≥ 900 px) or narrow, with or without reduced motion. */
function setViewport({ wide, reducedMotion = false }: { wide: boolean; reducedMotion?: boolean }) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('min-width: 900px')
          ? wide
          : query.includes('prefers-reduced-motion')
            ? reducedMotion
            : false,
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

/** IntersectionObserver stand-in: tests decide when the sentinel leaves the viewport. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = () => [];
  /** The sentinel scrolled up under the header (stuck) or back into view (not stuck). */
  fire(stuck: boolean) {
    const entry = {
      isIntersecting: !stuck,
      boundingClientRect: { top: stuck ? -20 : 200 },
      rootBounds: { top: 64 },
    } as unknown as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

const progressOf = (detail: DocumentDetail) =>
  makeProgress({
    pending: detail.values.filter((v) => v.reviewState === 'pending').length,
    carriedOver: detail.values.filter((v) => v.reviewState === 'carried_over').length,
    total: detail.values.length,
  });

async function showInvoiceV2() {
  const detail = invoiceV2Detail();
  api.getDocument.mockResolvedValue(detail);
  api.getProgress.mockResolvedValue(progressOf(detail));
  api.getLlmSettings.mockResolvedValue({
    configured: true,
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    keyHint: 'a1b2',
    lastVerifiedAt: null,
    updatedAt: null,
  });
  const view = renderApp(`/documents/${detail.document.id}`);
  await screen.findByText(/2 values need your review\./);
  return { ...view, detail };
}

const reviewBar = () => document.querySelector<HTMLElement>('[data-sticky="review-bar"]');
const documentPanel = () => screen.getByRole('complementary', { name: /Parsed text/ });
const textRegion = () => screen.getByRole('region', { name: 'Document text, version 2' });

beforeEach(() => {
  vi.resetAllMocks();
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('review screen layout on wide screens (≥ 900 px)', () => {
  it('keeps the review bar and the document panel sticky; the text is a named, focusable scroll area', async () => {
    setViewport({ wide: true });
    await showInvoiceV2();

    expect(reviewBar()).not.toBeNull();
    expect(
      within(reviewBar() as HTMLElement).getByRole('region', { name: 'Review summary' }),
    ).toBeInTheDocument();
    expect(documentPanel()).toHaveAttribute('data-sticky', 'document-panel');
    expect(textRegion()).toHaveAttribute('tabindex', '0');
  });

  it('shows the stuck state only while the sentinel is under the header', async () => {
    setViewport({ wide: true });
    await showInvoiceV2();
    const observer = FakeIntersectionObserver.instances.at(-1);
    if (!observer) throw new Error('no IntersectionObserver was created');
    expect(reviewBar()).toHaveAttribute('data-stuck', 'false');

    act(() => observer.fire(true));
    expect(reviewBar()).toHaveAttribute('data-stuck', 'true');
    expect(reviewBar()?.className).toMatch(/stuck/);

    act(() => observer.fire(false));
    expect(reviewBar()).toHaveAttribute('data-stuck', 'false');
  });

  it('scrolls only the panel to the quote (never the page) and emphasises it', async () => {
    setViewport({ wide: true });
    const scrollTo = vi.spyOn(Element.prototype, 'scrollTo');
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { user, detail } = await showInvoiceV2();
    const card = screen.getAllByRole('article')[0] as HTMLElement;
    const valueId = detail.values.find((v) => v.field === 'due_date')?.id ?? '';

    await user.click(within(card).getByRole('button', { name: 'Show in document text' }));

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.contexts[0]).toBe(textRegion());
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.getElementById(`evidence-${valueId}`)?.className).toMatch(/emphasised/);

    await user.click(within(card).getByRole('button', { name: 'Show in document text' }));
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('updates the counts in the sticky bar after an approval', async () => {
    setViewport({ wide: true });
    const { user, detail } = await showInvoiceV2();
    const updated = progressOf(detail);
    api.reviewValue.mockResolvedValue({
      ...(detail.values.find((v) => v.reviewState === 'pending') ?? detail.values[0]!),
      reviewState: 'approved',
      latestReview: makeReview(),
    });
    api.getProgress.mockResolvedValue({ ...updated, pending: 1, approved: 1 });
    const bar = within(reviewBar() as HTMLElement);
    expect(bar.getByRole('button', { name: '2 pending' })).toBeInTheDocument();

    const card = screen.getAllByRole('article')[0] as HTMLElement;
    await user.click(within(card).getByRole('button', { name: /^Approve/ }));

    expect(await bar.findByRole('button', { name: '1 pending' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: '1 approved' })).toBeInTheDocument();
    expect(bar.getByRole('group', { name: 'Filter values by status' })).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('animates the stuck shadow only without reduced motion', async () => {
    setViewport({ wide: true, reducedMotion: false });
    const first = await showInvoiceV2();
    expect(reviewBar()?.className).toMatch(/animated/);
    first.unmount();

    setViewport({ wide: true, reducedMotion: true });
    await showInvoiceV2();
    expect(reviewBar()?.className).not.toMatch(/animated/);
  });
});

describe('review screen layout on narrow screens (< 900 px)', () => {
  it('stacks: the document panel is not sticky (the review bar stays, compact)', async () => {
    setViewport({ wide: false });
    await showInvoiceV2();

    expect(documentPanel()).not.toHaveAttribute('data-sticky');
    expect(reviewBar()).not.toBeNull();
  });

  it('scrolls the page to the quote, since the panel is below the values', async () => {
    setViewport({ wide: false });
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { user, detail } = await showInvoiceV2();
    const card = screen.getAllByRole('article')[0] as HTMLElement;
    const valueId = detail.values.find((v) => v.field === 'due_date')?.id ?? '';

    await user.click(within(card).getByRole('button', { name: 'Show in document text' }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById(`evidence-${valueId}`));
  });
});

describe('states without a review bar', () => {
  it('shows no sticky review bar on a read-only older version; its panel is still sticky', async () => {
    setViewport({ wide: true });
    const detail = invoiceV2Detail();
    const v1 = {
      ...detail,
      version: { ...detail.version, versionNo: 1, baselineVersionNo: null },
    };
    api.getDocument.mockResolvedValue(v1);
    api.getProgress.mockResolvedValue(progressOf(v1));
    renderApp(`/documents/${detail.document.id}?version=1`);

    expect(await screen.findByText(/read-only/)).toBeInTheDocument();
    expect(reviewBar()).toBeNull();
    expect(screen.getByRole('complementary', { name: /Parsed text · v1/ })).toHaveAttribute(
      'data-sticky',
      'document-panel',
    );
  });
});

describe('status filters in the review bar', () => {
  const filters = () => within(screen.getByRole('group', { name: 'Filter values by status' }));

  it('starts on All, with every count as a toggle button', async () => {
    setViewport({ wide: true });
    await showInvoiceV2();

    expect(filters().getByRole('button', { name: 'All 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      filters()
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['All 5', '2 pending', '0 gaps', '3 carried over', '0 approved', '0 corrected']);
  });

  it('shows only the chosen status below, and pressing it again shows everything', async () => {
    setViewport({ wide: true });
    const { user } = await showInvoiceV2();
    expect(screen.getAllByRole('article')).toHaveLength(2);

    await user.click(filters().getByRole('button', { name: '3 carried over' }));

    const values = within(screen.getByRole('region', { name: 'Extracted values' }));
    expect(filters().getByRole('button', { name: '3 carried over' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(values.queryAllByRole('article')).toHaveLength(0);
    expect(values.getByRole('heading', { name: /Carried over from v1/ })).toBeInTheDocument();
    expect(values.queryByRole('heading', { name: /Needs review/ })).not.toBeInTheDocument();

    await user.click(filters().getByRole('button', { name: '2 pending' }));
    expect(values.getAllByRole('article')).toHaveLength(2);
    expect(values.queryByRole('heading', { name: /Carried over/ })).not.toBeInTheDocument();

    await user.click(filters().getByRole('button', { name: '2 pending' }));
    expect(filters().getByRole('button', { name: 'All 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(values.getByRole('heading', { name: /Carried over/ })).toBeInTheDocument();
  });

  it('explains an empty filter instead of showing a blank column', async () => {
    setViewport({ wide: true });
    const { user } = await showInvoiceV2();

    await user.click(filters().getByRole('button', { name: '0 corrected' }));

    expect(screen.getByText('No corrected values on this version yet.')).toBeInTheDocument();
  });
});
