import { vi } from 'vitest';
import { api } from '../api/client.js';

/** Typed spies for every endpoint, after the client module has been mocked. */
export function mockedApi() {
  return {
    listDocuments: vi.mocked(api.listDocuments),
    getDocument: vi.mocked(api.getDocument),
    getProgress: vi.mocked(api.getProgress),
    uploadDocument: vi.mocked(api.uploadDocument),
    uploadVersion: vi.mocked(api.uploadVersion),
    reviewValue: vi.mocked(api.reviewValue),
    retry: vi.mocked(api.retry),
  };
}
