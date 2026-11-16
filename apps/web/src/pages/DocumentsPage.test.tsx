import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client.js';
import { listRefetchInterval, POLL_INTERVAL_MS } from '../api/queries.js';
import { makeProgress, makeSummary } from '../test/factories.js';
import { mockedApi } from '../test/mock-api.js';
import { renderApp } from '../test/render.js';

vi.mock('../api/client.js', async (importOriginal) =>
  (await import('../test/api-mock-factory.js')).apiModuleMock(importOriginal),
);
const api = mockedApi();

beforeEach(() => {
  vi.resetAllMocks();
});

const rowOf = (title: string) => {
  const row = screen.getByRole('link', { name: title }).closest('tr');
  if (!row) throw new Error(`no row for ${title}`);
  return within(row);
};

describe('DocumentsPage', () => {
  it('shows every status with its label, progress and action', async () => {
    api.listDocuments.mockResolvedValue({
      documents: [
        makeSummary({
          title: 'Invoice',
          progress: makeProgress({ pending: 2, carriedOver: 3, total: 5 }),
          currentVersionNo: 2,
        }),
        makeSummary({ title: 'Lease', status: 'queued', progress: makeProgress() }),
        makeSummary({ title: 'Report', status: 'extracting', progress: makeProgress() }),
        makeSummary({
          title: 'Broken',
          status: 'failed',
          error: 'LLM request timed out',
          progress: makeProgress(),
        }),
      ],
    });

    renderApp('/');

    expect(await screen.findByRole('link', { name: 'Invoice' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toBeInTheDocument();
    expect(rowOf('Invoice').getByText('Extracted')).toBeInTheDocument();
    expect(
      rowOf('Invoice').getByText('2 pending · 3 carried over · 0 approved'),
    ).toBeInTheDocument();
    expect(
      rowOf('Invoice').getByRole('link', { name: /Review 2 values in Invoice/ }),
    ).toHaveTextContent('Review 2');
    // The one action per row: the amber "Review N" when values wait for review.
    expect(
      rowOf('Invoice').getByRole('link', { name: /Review 2 values in Invoice/ }).className,
    ).toMatch(/reviewButton/);
    expect(rowOf('Invoice').getByText('v2')).toBeInTheDocument();
    expect(rowOf('Invoice').queryByText(/of 2/)).not.toBeInTheDocument();
    expect(rowOf('Invoice').getByText(/^Updated /)).toBeInTheDocument();
    expect(rowOf('Lease').getByText('Queued')).toBeInTheDocument();
    expect(
      rowOf('Lease').getByRole('link', { name: 'View extraction progress of Lease' }),
    ).toHaveTextContent('View progress');
    expect(
      rowOf('Report').getByRole('link', { name: 'View extraction progress of Report' }),
    ).toBeInTheDocument();
    expect(rowOf('Report').getByText('Extracting')).toBeInTheDocument();
    expect(rowOf('Report').getByText('Values appear when extraction finishes')).toBeInTheDocument();
    expect(rowOf('Broken').getByText('Failed')).toBeInTheDocument();
    expect(rowOf('Broken').getByText('LLM request timed out')).toBeInTheDocument();
    expect(
      rowOf('Broken').getByRole('button', { name: /Retry extraction of Broken/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 values need review across 1 document. 2 documents are still extracting.'),
    ).toBeInTheDocument();
  });

  it('retries a failed document from its row', async () => {
    const failed = makeSummary({
      title: 'Broken',
      status: 'failed',
      error: 'boom',
      progress: makeProgress(),
    });
    api.listDocuments.mockResolvedValue({ documents: [failed] });
    api.retry.mockResolvedValue({ versionId: failed.id, status: 'queued' });
    const { user } = renderApp('/');

    await user.click(await screen.findByRole('button', { name: /Retry extraction of Broken/ }));

    expect(api.retry).toHaveBeenCalledWith(failed.id);
    expect(await screen.findByText('Extraction restarted')).toBeInTheDocument();
  });

  it('shows the empty state with an upload button', async () => {
    api.listDocuments.mockResolvedValue({ documents: [] });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'No documents yet' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Upload PDF/ })).toHaveLength(2);
  });

  it('shows a readable error with a way to try again', async () => {
    api.listDocuments.mockRejectedValueOnce(
      new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'),
    );
    api.listDocuments.mockResolvedValueOnce({ documents: [] });
    const { user } = renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
  });

  it('names the page in the browser title', async () => {
    api.listDocuments.mockResolvedValue({ documents: [] });
    renderApp('/');
    await screen.findByText('No documents yet');
    expect(document.title).toBe('Documents · Review Desk');
  });
});

describe('list polling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls every 3 s only while a document is queued or extracting', () => {
    const settled = {
      documents: [makeSummary({ status: 'extracted' }), makeSummary({ status: 'failed' })],
    };
    const busy = {
      documents: [makeSummary({ status: 'extracted' }), makeSummary({ status: 'extracting' })],
    };
    expect(listRefetchInterval(busy)).toBe(POLL_INTERVAL_MS);
    expect(listRefetchInterval({ documents: [makeSummary({ status: 'queued' })] })).toBe(
      POLL_INTERVAL_MS,
    );
    expect(listRefetchInterval(settled)).toBe(false);
    expect(listRefetchInterval(undefined)).toBe(false);
  });

  it('refetches while extracting and stops once everything has settled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.listDocuments
      .mockResolvedValueOnce({
        documents: [
          makeSummary({ title: 'Report', status: 'extracting', progress: makeProgress() }),
        ],
      })
      .mockResolvedValue({ documents: [makeSummary({ title: 'Report', status: 'extracted' })] });
    renderApp('/');
    await screen.findByText('Extracting');

    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 100));
    expect(await screen.findByText('Extracted')).toBeInTheDocument();
    const callsWhenSettled = api.listDocuments.mock.calls.length;

    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3));
    expect(api.listDocuments.mock.calls.length).toBe(callsWhenSettled);
  });

  it('counts gaps in the row, outlines View when nothing is pending, and explains the review card', async () => {
    api.listDocuments.mockResolvedValue({
      documents: [
        makeSummary({
          title: 'Report',
          progress: makeProgress({ pending: 5, gaps: 2, total: 5 }),
        }),
        makeSummary({
          title: 'Lease',
          progress: makeProgress({ pending: 0, approved: 5, total: 5 }),
        }),
        makeSummary({
          title: 'Invoice',
          progress: makeProgress({ pending: 1, approved: 4, total: 5 }),
        }),
      ],
    });

    renderApp('/');

    await screen.findByRole('link', { name: 'Report' });
    expect(rowOf('Report').getByText('5 pending · 2 gaps · 0 approved')).toBeInTheDocument();
    const view = rowOf('Lease').getByRole('link', { name: 'View Lease' });
    expect(view.className).toMatch(/outline/);
    expect(view.className).not.toMatch(/reviewButton/);
    const cards = within(screen.getByText('Values to review').closest('dl') as HTMLElement);
    expect(cards.getByText('Values to review')).toBeInTheDocument();
    expect(cards.getByText('in 2 documents')).toBeInTheDocument();
  });

  describe('pagination (25 documents per page)', () => {
    const manyDocuments = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        makeSummary({
          title: `Document ${String(index + 1).padStart(2, '0')}`,
          progress: makeProgress({ pending: 1, total: 1 }),
        }),
      );
    const tableRows = () => screen.getAllByRole('row').slice(1); // without the header row

    it('shows 25 at a time with page links, while the totals still count every document', async () => {
      api.listDocuments.mockResolvedValue({ documents: manyDocuments(60) });
      const { user } = renderApp('/');

      await screen.findByRole('link', { name: 'Document 01' });
      expect(tableRows()).toHaveLength(25);
      const pages = within(screen.getByRole('navigation', { name: 'Documents pages' }));
      expect(pages.getByText('Showing 1–25 of 60')).toBeInTheDocument();
      expect(pages.getByRole('link', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByText('60 values need review across 60 documents.')).toBeInTheDocument();

      await user.click(pages.getByRole('link', { name: /Next/ }));
      expect(await screen.findByRole('link', { name: 'Document 26' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Document 01' })).not.toBeInTheDocument();
      expect(pages.getByText('Showing 26–50 of 60')).toBeInTheDocument();

      await user.click(pages.getByRole('link', { name: 'Page 3' }));
      expect(await screen.findByRole('link', { name: 'Document 60' })).toBeInTheDocument();
      expect(tableRows()).toHaveLength(10);
      expect(pages.getByText('Next')).toHaveAttribute('aria-disabled', 'true');
    });

    it('opens the page in the URL, and the last page for one past the end', async () => {
      api.listDocuments.mockResolvedValue({ documents: manyDocuments(30) });
      renderApp('/?page=7');

      expect(await screen.findByRole('link', { name: 'Document 26' })).toBeInTheDocument();
      expect(screen.getByText('Showing 26–30 of 30')).toBeInTheDocument();
    });

    it('shows no pagination when every document fits on one page', async () => {
      api.listDocuments.mockResolvedValue({ documents: manyDocuments(25) });
      renderApp('/');

      await screen.findByRole('link', { name: 'Document 25' });
      expect(screen.queryByRole('navigation', { name: 'Documents pages' })).not.toBeInTheDocument();
    });
  });
});
