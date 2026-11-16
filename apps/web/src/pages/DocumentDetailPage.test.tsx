import type { DocumentDetail, ExtractedValue } from '@doc-review/shared';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client.js';
import { detailRefetchInterval, POLL_INTERVAL_MS } from '../api/queries.js';
import {
  invoiceV2Detail,
  makeDetail,
  makeGap,
  makeProgress,
  makeReview,
  makeValue,
} from '../test/factories.js';
import { mockedApi } from '../test/mock-api.js';
import { renderApp } from '../test/render.js';

vi.mock('../api/client.js', async (importOriginal) =>
  (await import('../test/api-mock-factory.js')).apiModuleMock(importOriginal),
);
const api = mockedApi();

const progressOf = (detail: DocumentDetail) =>
  makeProgress({
    pending: detail.values.filter((v) => v.reviewState === 'pending').length,
    carriedOver: detail.values.filter((v) => v.reviewState === 'carried_over').length,
    gaps: detail.values.filter((v) => v.value === null).length,
    total: detail.values.length,
  });

function show(detail: DocumentDetail, path = `/documents/${detail.document.id}`) {
  api.getDocument.mockResolvedValue(detail);
  api.getProgress.mockResolvedValue(progressOf(detail));
  return renderApp(path);
}

/** A review never settles: lets a test look at the page while the save is in flight. */
const neverSettles = () => new Promise<ExtractedValue>(() => undefined);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('invoice v2 after re-extraction (Review.dc.html)', () => {
  it('shows exactly 2 values to review, each with the previous version, and 3 read-only carried rows', async () => {
    const detail = invoiceV2Detail();
    show(detail);

    expect(
      await screen.findByRole('heading', { level: 1, name: detail.document.title }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/2 values need your review\./)).toBeInTheDocument();
    expect(screen.getByText(/Their evidence changed in v2\./)).toBeInTheDocument();

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(
      cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent),
    ).toEqual(['due_date · date', 'total_amount · money']);
    expect(screen.getAllByText('Previously in v1')).toHaveLength(2);
    expect(within(cards[1] as HTMLElement).getByText('$5,230.29')).toBeInTheDocument();

    const carriedHeading = screen.getByRole('heading', { name: /Carried over from v1/ });
    const carried = within(carriedHeading.nextElementSibling as HTMLElement);
    expect(carried.getAllByText(/Carried over · (approved|corrected)/)).toHaveLength(3);
    expect(carried.queryAllByRole('button')).toHaveLength(0);
    expect(carried.getByText('Carried over · corrected')).toBeInTheDocument();
    expect(carried.getByText(/Extracted: MERIDIAN OFFICE SUPPLIES LLC/)).toBeInTheDocument();
  });

  it('shows the source quote with its line and highlights it in the document text', async () => {
    show(invoiceV2Detail());
    expect(await screen.findByText('Source quote · v2, line 5')).toBeInTheDocument();
    const text = screen.getByRole('complementary', { name: 'Parsed text · v2' });
    expect(within(text).getByText('Due Date: 2025-11-13').tagName).toBe('MARK');
  });

  it('approves a value with the right payload, then announces it', async () => {
    const detail = invoiceV2Detail();
    api.reviewValue.mockResolvedValue(makeValue());
    const { user } = show(detail);

    await user.click(await screen.findByRole('button', { name: 'Approve due_date' }));

    const dueDate = detail.values.find((v) => v.field === 'due_date');
    expect(api.reviewValue).toHaveBeenCalledWith(dueDate?.id, { action: 'approve' });
    expect(await screen.findByText('Approved due_date')).toBeInTheDocument();
  });

  it('corrects a value: prefilled form, the shared schema validates, payload has value and note', async () => {
    const detail = invoiceV2Detail();
    api.reviewValue.mockResolvedValue(makeValue());
    const { user } = show(detail);

    await user.click(await screen.findByRole('button', { name: 'Correct total_amount' }));
    const input = screen.getByLabelText(/Corrected value/);
    expect(input).toHaveValue('$6,126.45');
    expect(screen.getByText('Correcting')).toBeInTheDocument();
    expect(
      screen.getByText('The extracted value is kept; your correction is stored beside it.'),
    ).toBeInTheDocument();

    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the corrected value.');
    expect(api.reviewValue).not.toHaveBeenCalled();

    await user.type(input, '$6,200.00');
    await user.type(screen.getByLabelText(/Note/), 'Per vendor email');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    const total = detail.values.find((v) => v.field === 'total_amount');
    expect(api.reviewValue).toHaveBeenCalledWith(total?.id, {
      action: 'correct',
      value: '$6,200.00',
      note: 'Per vendor email',
    });
  });

  it('disables review buttons while a review is being saved (no double submit)', async () => {
    api.reviewValue.mockImplementation(neverSettles);
    const { user } = show(invoiceV2Detail());

    await user.click(await screen.findByRole('button', { name: 'Approve due_date' }));

    expect(screen.getByRole('button', { name: 'Approve due_date' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve total_amount' })).toBeDisabled();
    expect(api.reviewValue).toHaveBeenCalledTimes(1);
  });

  it('shows a readable error when the review is rejected', async () => {
    api.reviewValue.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Version 2 is no longer current'),
    );
    const { user } = show(invoiceV2Detail());
    await user.click(await screen.findByRole('button', { name: 'Approve due_date' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Version 2 is no longer current');
  });

  it('works end to end with the keyboard only', async () => {
    api.reviewValue.mockResolvedValue(makeValue());
    const detail = invoiceV2Detail();
    const { user } = show(detail);
    const approve = await screen.findByRole('button', { name: 'Approve due_date' });

    approve.focus();
    await user.keyboard('{Enter}');
    expect(api.reviewValue).toHaveBeenLastCalledWith(detail.values[2]?.id, { action: 'approve' });

    await screen.findByText('Approved due_date');
    screen.getByRole('button', { name: 'Correct total_amount' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText(/Corrected value/)).toHaveFocus();
    await user.keyboard('{Control>}a{/Control}5300.00');
    await user.tab();
    await user.keyboard('Rounded per vendor{Enter}');

    expect(api.reviewValue).toHaveBeenLastCalledWith(detail.values[4]?.id, {
      action: 'correct',
      value: '5300.00',
      note: 'Rounded per vendor',
    });
  });
});

describe('gaps (Gaps.dc.html)', () => {
  const report = () =>
    makeDetail({
      document: { type: 'market_report', title: 'Market report' },
      values: [
        makeValue({
          field: 'vacancy_rate',
          value: '4.2%',
          normalizedValue: '4.2',
          evidence: 'declined to 4.2%',
        }),
        makeGap(),
      ],
    });

  it('always shows the gap with its reason; Confirm gap approves it', async () => {
    const detail = report();
    api.reviewValue.mockResolvedValue(makeValue());
    const { user } = show(detail);

    expect(
      await screen.findByText('The report does not state median household income.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No value')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm gap for median_household_income' }),
    );
    expect(api.reviewValue).toHaveBeenCalledWith(detail.values[1]?.id, { action: 'approve' });
  });

  it('Enter value… opens an empty correction form and saves the value', async () => {
    const detail = report();
    api.reviewValue.mockResolvedValue(makeValue());
    const { user } = show(detail);

    await user.click(
      await screen.findByRole('button', { name: 'Enter value for median_household_income' }),
    );
    const input = screen.getByLabelText(/Corrected value/);
    expect(input).toHaveValue('');
    await user.type(input, '$84,000');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(api.reviewValue).toHaveBeenCalledWith(detail.values[1]?.id, {
      action: 'correct',
      value: '$84,000',
    });
  });

  it('lets a reviewed value be changed (a new review), and shows the calm state when nothing is pending', async () => {
    const detail = makeDetail({
      values: [makeValue({ reviewState: 'approved', latestReview: makeReview() })],
    });
    show(detail);
    expect(await screen.findByText('All values reviewed.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change review of invoice_number' }),
    ).toBeInTheDocument();
  });
});

describe('other states', () => {
  it('shows an older version read-only: banner, values, and no review actions anywhere', async () => {
    const v2 = invoiceV2Detail();
    const v1 = makeDetail({
      document: { ...v2.document, currentVersionNo: 2 },
      version: { versionNo: 1, parsedText: 'Due Date: 2025-10-14' },
      versions: v2.versions,
      values: [
        makeValue({
          field: 'due_date',
          value: '2025-10-14',
          reviewState: 'approved',
          latestReview: makeReview(),
        }),
        makeGap({ field: 'vendor_name' }),
      ],
    });
    show(v1, `/documents/${v1.document.id}?version=1`);

    expect(await screen.findByText(/Viewing version 1 — read-only\./)).toBeInTheDocument();
    expect(screen.getByText('Superseded')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to current version' })).toHaveAttribute(
      'href',
      `/documents/${v1.document.id}`,
    );
    expect(
      screen.queryByRole('button', {
        name: /Approve|Correct|Change review|Confirm gap|Enter value|Upload new version/,
      }),
    ).not.toBeInTheDocument();
    expect(api.getDocument).toHaveBeenCalledWith(v1.document.id, 1);
  });

  it('shows the failure reason, and Retry extraction calls the retry mutation', async () => {
    const failed = makeDetail({
      version: { status: 'failed', error: 'LLM authentication failed — check LLM_API_KEY' },
    });
    api.retry.mockResolvedValue({ versionId: failed.version.id, status: 'queued' });
    const { user } = show(failed);

    expect(await screen.findByRole('heading', { name: 'Extraction failed' })).toBeInTheDocument();
    expect(screen.getByText('LLM authentication failed — check LLM_API_KEY')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry extraction' }));
    expect(api.retry).toHaveBeenCalledWith(failed.document.id);
  });

  it('shows the extracting state and polls only while the current version is in flight', async () => {
    const extracting = makeDetail({ version: { status: 'extracting' } });
    show(extracting);
    expect(await screen.findByText(/^Extracting values from v\d+…$/)).toBeInTheDocument();
    expect(detailRefetchInterval(extracting)).toBe(POLL_INTERVAL_MS);
    expect(detailRefetchInterval(invoiceV2Detail())).toBe(false);
  });

  it('shows not found for an unknown document', async () => {
    api.getDocument.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Document not found'));
    api.getProgress.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Document not found'));
    renderApp('/documents/00000000-0000-4000-8000-000000000999');
    expect(await screen.findByRole('heading', { level: 1, name: 'Not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to all documents' })).toHaveAttribute('href', '/');
  });

  it('shows not found for an unknown route', async () => {
    renderApp('/nope');
    expect(await screen.findByRole('heading', { level: 1, name: 'Not found' })).toBeInTheDocument();
  });
});

describe('a version being extracted: progress on the left, the uploaded PDF on the right', () => {
  it('shows the status bar, the current step, and the PDF of that version', async () => {
    const extracting = makeDetail({ version: { status: 'extracting', versionNo: 3 } });
    show(extracting);

    expect(await screen.findByText('Extracting values from v3…')).toBeInTheDocument();
    expect(document.querySelector('[data-sticky="review-bar"]')).not.toBeNull();
    const steps = within(screen.getByRole('list'));
    expect(steps.getAllByRole('listitem').map((step) => step.getAttribute('aria-current'))).toEqual(
      [null, null, 'step', null],
    );
    expect(steps.getByText(/Uploaded/)).toHaveTextContent('(done)');
    expect(steps.getByText(/Extracting values/)).toHaveTextContent('(in progress)');

    // The base URL comes from configuration (same-origin /api by default).
    const fileUrl = `/documents/${extracting.document.id}/file?version=3`;
    expect(screen.getByTitle('Uploaded PDF, version 3').getAttribute('src')).toMatch(
      new RegExp(`${fileUrl.replace(/[?.]/g, '\\$&')}$`),
    );
    expect(screen.getByRole('link', { name: /Open in new tab/ }).getAttribute('href')).toBe(
      screen.getByTitle('Uploaded PDF, version 3').getAttribute('src'),
    );
  });

  it('while queued after a failed attempt, says it will be retried', async () => {
    show(
      makeDetail({
        version: {
          status: 'queued',
          versionNo: 2,
          error: 'Attempt 1 of 3 failed, retrying: LLM rate limit reached (429)',
        },
      }),
    );

    expect(await screen.findByText('Waiting to extract v2…')).toBeInTheDocument();
    const current = screen
      .getAllByRole('listitem')
      .find((step) => step.getAttribute('aria-current'));
    expect(current).toHaveTextContent('Waiting for a worker');
    expect(current).toHaveTextContent('Attempt 1 of 3 failed, retrying');
  });
});
