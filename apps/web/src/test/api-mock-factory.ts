import { vi } from 'vitest';
import type * as ClientModule from '../api/client.js';

/**
 * Factory for `vi.mock('../api/client.js', ...)`: keeps ApiError and errorMessage real and
 * replaces every request with a spy. Only a type import of the client here, so it can be
 * loaded from inside the hoisted mock without a circular import.
 */
export async function apiModuleMock(importOriginal: () => Promise<typeof ClientModule>) {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      listDocuments: vi.fn(),
      getDocument: vi.fn(),
      getProgress: vi.fn(),
      uploadDocument: vi.fn(),
      uploadVersion: vi.fn(),
      reviewValue: vi.fn(),
      retry: vi.fn(),
      getLlmSettings: vi.fn(),
      testLlmConnection: vi.fn(),
      saveLlmSettings: vi.fn(),
    },
  };
}
