import {
  type CreateDocumentFields,
  type DocumentDetail,
  documentDetailSchema,
  type DocumentList,
  documentListSchema,
  type ErrorCode,
  errorEnvelopeSchema,
  type ExtractedValue,
  extractedValueSchema,
  type LlmSaveRequest,
  type LlmSettings,
  llmSettingsSchema,
  type LlmTestRequest,
  type LlmTestResult,
  llmTestResultSchema,
  type RetryAccepted,
  retryAcceptedSchema,
  type ReviewProgress,
  reviewProgressSchema,
  type ReviewRequest,
  type UploadAccepted,
  uploadAcceptedSchema,
} from '@doc-review/shared';

/** Any shared Zod schema: the client only needs safeParse. */
interface Schema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

/**
 * The API's base URL. Same-origin `/api` by default: nginx (Docker) and the Vite dev server both
 * proxy it to the API, so there is no CORS and no build-time URL. VITE_API_URL overrides it,
 * e.g. to point a dev build at another API. No secrets live in the web app.
 */
const BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE';

/** Every failure the UI can show: a status, a stable code and a message a person can read. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request<T>(path: string, schema: Schema<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
    );
  }

  const body = await readJson(response);
  if (!response.ok) {
    const envelope = errorEnvelopeSchema.safeParse(body);
    throw envelope.success
      ? new ApiError(response.status, envelope.data.error.code, envelope.data.error.message)
      : new ApiError(response.status, 'INTERNAL_ERROR', `Request failed (${response.status}).`);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'The server sent an unexpected response.',
    );
  }
  return parsed.data;
}

const versionQuery = (version: number | undefined) =>
  version === undefined ? '' : `?version=${version}`;

function postJson<T>(path: string, schema: Schema<T>, body?: unknown): Promise<T> {
  return request(path, schema, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function putJson<T>(path: string, schema: Schema<T>, body: unknown): Promise<T> {
  return request(path, schema, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postForm<T>(path: string, schema: Schema<T>, form: FormData): Promise<T> {
  return request(path, schema, { method: 'POST', body: form });
}

export interface UploadDocumentInput extends CreateDocumentFields {
  file: File;
}

/** The only module that talks to the API. */
export const api = {
  listDocuments: (): Promise<DocumentList> => request('/documents', documentListSchema),

  getDocument: (id: string, version?: number): Promise<DocumentDetail> =>
    request(`/documents/${id}${versionQuery(version)}`, documentDetailSchema),

  getProgress: (id: string, version?: number): Promise<ReviewProgress> =>
    request(`/documents/${id}/progress${versionQuery(version)}`, reviewProgressSchema),

  uploadDocument: ({ type, title, file }: UploadDocumentInput): Promise<UploadAccepted> => {
    const form = new FormData();
    form.append('type', type);
    if (title) form.append('title', title);
    form.append('file', file);
    return postForm('/documents', uploadAcceptedSchema, form);
  },

  uploadVersion: (documentId: string, file: File): Promise<UploadAccepted> => {
    const form = new FormData();
    form.append('file', file);
    return postForm(`/documents/${documentId}/versions`, uploadAcceptedSchema, form);
  },

  reviewValue: (valueId: string, review: ReviewRequest): Promise<ExtractedValue> =>
    postJson(`/values/${valueId}/review`, extractedValueSchema, review),

  retry: (documentId: string): Promise<RetryAccepted> =>
    postJson(`/documents/${documentId}/retry`, retryAcceptedSchema),

  /** URL of a version's uploaded PDF, for the browser's own PDF viewer (not a fetch). */
  fileUrl: (id: string, version?: number): string =>
    `${BASE_URL}/documents/${id}/file${versionQuery(version)}`,

  getLlmSettings: (): Promise<LlmSettings> => request('/settings/llm', llmSettingsSchema),

  /** The key travels only in this request body; responses never contain it. */
  testLlmConnection: (input: LlmTestRequest): Promise<LlmTestResult> =>
    postJson('/settings/llm/test', llmTestResultSchema, input),

  saveLlmSettings: (input: LlmSaveRequest): Promise<LlmSettings> =>
    putJson('/settings/llm', llmSettingsSchema, input),
};

/** A message for any thrown value, for error states and toasts. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
