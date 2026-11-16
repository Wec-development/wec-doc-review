import type { DocumentType, ExtractionResult } from '@doc-review/shared';

export interface ExtractionInput {
  versionId: string;
  documentType: DocumentType;
  /** The version's stored file path (storage key, or repo-relative for seeded fixtures). */
  filePath: string;
  /** Aborted when the worker loses the lease or shuts down; extractors should stop early. */
  signal: AbortSignal;
}

/**
 * Turns one document version into field values with evidence. Throw an ExtractionError to say
 * whether a failure is worth retrying; any other error is treated as transient.
 */
export interface Extractor {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}
