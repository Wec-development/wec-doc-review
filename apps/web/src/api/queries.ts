import type {
  DocumentDetail,
  DocumentList,
  LlmSaveRequest,
  LlmTestRequest,
  ReviewRequest,
} from '@doc-review/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { isInFlight } from '../lib/status.js';
import { api, type UploadDocumentInput } from './client.js';

export const POLL_INTERVAL_MS = 3000;

export const queryKeys = {
  documents: ['documents'] as const,
  document: (id: string, version?: number) => ['document', id, version ?? 'current'] as const,
  documentAll: (id: string) => ['document', id] as const,
  progress: (id: string, version?: number) => ['progress', id, version ?? 'current'] as const,
  progressAll: (id: string) => ['progress', id] as const,
  llmSettings: ['settings', 'llm'] as const,
};

/** Poll the list only while some document is queued or extracting; stop once all settle. */
export function listRefetchInterval(data: DocumentList | undefined): number | false {
  return data?.documents.some((document) => isInFlight(document.status)) ? POLL_INTERVAL_MS : false;
}

/** Poll a document only while the version on screen is the current one and still in flight. */
export function detailRefetchInterval(data: DocumentDetail | undefined): number | false {
  if (!data) return false;
  const isCurrent = data.version.versionNo === data.document.currentVersionNo;
  return isCurrent && isInFlight(data.version.status) ? POLL_INTERVAL_MS : false;
}

export function useDocuments() {
  return useQuery({
    queryKey: queryKeys.documents,
    queryFn: api.listDocuments,
    refetchInterval: (query) => listRefetchInterval(query.state.data),
    refetchIntervalInBackground: false,
  });
}

export function useDocument(id: string, version?: number, enabled = true) {
  return useQuery({
    enabled,
    queryKey: queryKeys.document(id, version),
    queryFn: () => api.getDocument(id, version),
    refetchInterval: (query) => detailRefetchInterval(query.state.data),
    refetchIntervalInBackground: false,
  });
}

/** Fired alongside useDocument (no waterfall); polls with it while extraction runs. */
export function useProgress(
  id: string,
  version: number | undefined,
  polling: boolean,
  enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: queryKeys.progress(id, version),
    queryFn: () => api.getProgress(id, version),
    refetchInterval: polling ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
}

/**
 * Refreshes progress when the version's status changes (e.g. extracting -> extracted): polling
 * stops on the same tick, so the last counts fetched mid-extraction would otherwise stay.
 */
export function useRefreshProgressOnStatusChange(id: string, status: string | undefined) {
  const queryClient = useQueryClient();
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current !== undefined && status !== undefined && previous.current !== status) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.progressAll(id) });
    }
    previous.current = status;
  }, [id, status, queryClient]);
}

/** After any write: refresh the list and everything cached for the document. */
function useInvalidateDocument() {
  const queryClient = useQueryClient();
  return (documentId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.documents }),
      queryClient.invalidateQueries({ queryKey: queryKeys.documentAll(documentId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.progressAll(documentId) }),
    ]);
}

export function useUploadDocument() {
  const invalidate = useInvalidateDocument();
  return useMutation({
    mutationFn: (input: UploadDocumentInput) => api.uploadDocument(input),
    onSuccess: (accepted) => invalidate(accepted.documentId),
  });
}

export function useUploadVersion(documentId: string) {
  const invalidate = useInvalidateDocument();
  return useMutation({
    mutationFn: (file: File) => api.uploadVersion(documentId, file),
    onSuccess: () => invalidate(documentId),
  });
}

/** No optimistic update: the server decides the new state (correctness over speed). */
export function useReviewValue(documentId: string) {
  const invalidate = useInvalidateDocument();
  return useMutation({
    mutationFn: ({ valueId, review }: { valueId: string; review: ReviewRequest }) =>
      api.reviewValue(valueId, review),
    onSuccess: () => invalidate(documentId),
  });
}

export function useRetry() {
  const invalidate = useInvalidateDocument();
  return useMutation({
    mutationFn: (documentId: string) => api.retry(documentId),
    onSuccess: (_accepted, documentId) => invalidate(documentId),
  });
}

/** Whether an LLM is configured (drives the "extraction is paused" banner and Settings). */
export function useLlmSettings() {
  return useQuery({ queryKey: queryKeys.llmSettings, queryFn: () => api.getLlmSettings() });
}

/** Never retried or cached: each test is an explicit action with the key being typed. */
export function useTestLlmConnection() {
  return useMutation({ mutationFn: (input: LlmTestRequest) => api.testLlmConnection(input) });
}

export function useSaveLlmSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LlmSaveRequest) => api.saveLlmSettings(input),
    onSuccess: async (saved) => {
      queryClient.setQueryData(queryKeys.llmSettings, saved);
      // Queued documents start extracting now; refresh their status.
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents });
    },
  });
}
