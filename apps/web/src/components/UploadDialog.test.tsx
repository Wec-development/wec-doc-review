import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client.js';
import { MAX_UPLOAD_BYTES } from '../lib/upload.js';
import { mockedApi } from '../test/mock-api.js';
import { renderApp } from '../test/render.js';

vi.mock('../api/client.js', async (importOriginal) =>
  (await import('../test/api-mock-factory.js')).apiModuleMock(importOriginal),
);
const api = mockedApi();

const pdf = (name = 'invoice-001.pdf') =>
  new File(['%PDF-1.4 test'], name, { type: 'application/pdf' });

async function openDialog() {
  api.listDocuments.mockResolvedValue({ documents: [] });
  const view = renderApp('/');
  await screen.findByText('No documents yet');
  const trigger = screen.getAllByRole('button', { name: /Upload PDF/ })[0];
  if (!trigger) throw new Error('no upload button');
  await view.user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Upload a document' });
  return { ...view, dialog: within(dialog), trigger };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('UploadDialog', () => {
  it('is a labelled modal dialog with the first field focused', async () => {
    const { dialog } = await openDialog();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(dialog.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('rejects a non-PDF file without calling the API', async () => {
    const { user, dialog } = await openDialog();
    // Browsers let people pick any file ("All files"), so the accept attribute is not enough.
    const anyFile = userEvent.setup({ applyAccept: false });
    const text = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await anyFile.upload(dialog.getByLabelText(/PDF file/), text);
    await user.click(dialog.getByRole('button', { name: 'Upload and extract' }));

    expect(dialog.getByRole('alert')).toHaveTextContent('Only PDF files are supported.');
    expect(api.uploadDocument).not.toHaveBeenCalled();
  });

  it('rejects a file over 10 MB without calling the API', async () => {
    const { user, dialog } = await openDialog();
    const big = pdf('big.pdf');
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    await user.upload(dialog.getByLabelText(/PDF file/), big);
    await user.click(dialog.getByRole('button', { name: 'Upload and extract' }));

    expect(dialog.getByRole('alert')).toHaveTextContent('File too large — the limit is 10 MB.');
    expect(api.uploadDocument).not.toHaveBeenCalled();
  });

  it('shows the server message for a 409', async () => {
    api.uploadDocument.mockRejectedValue(new ApiError(409, 'CONFLICT', 'File is identical'));
    const { user, dialog } = await openDialog();
    await user.upload(dialog.getByLabelText(/PDF file/), pdf());
    await user.click(dialog.getByRole('button', { name: 'Upload and extract' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent('Identical to current version');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('uploads with the chosen type and title, closes, toasts, and returns focus to the trigger', async () => {
    api.uploadDocument.mockResolvedValue({
      documentId: '00000000-0000-4000-8000-0000000000aa',
      versionId: '00000000-0000-4000-8000-0000000000bb',
      versionNo: 1,
      status: 'queued',
    });
    const { user, dialog, trigger } = await openDialog();
    await user.selectOptions(dialog.getByLabelText(/Document type/), 'lease');
    await user.type(dialog.getByLabelText(/Title/), 'Harbor lease');
    const file = pdf('lease.pdf');
    await user.upload(dialog.getByLabelText(/PDF file/), file);
    await user.click(dialog.getByRole('button', { name: 'Upload and extract' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.uploadDocument).toHaveBeenCalledWith({ type: 'lease', title: 'Harbor lease', file });
    expect(screen.getByText('Uploaded — extraction started')).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape and on Cancel, returning focus to the trigger', async () => {
    const { user, trigger } = await openDialog();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps Tab focus inside the dialog', async () => {
    const { user } = await openDialog();
    for (let i = 0; i < 10; i += 1) {
      await user.tab();
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    }
  });
});
