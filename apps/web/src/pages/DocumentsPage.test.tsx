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
    expect(rowOf('Lease').getByText('Queued')).toBeInTheDocument();
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
});
