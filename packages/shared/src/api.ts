import { z } from 'zod';
import {
  carriedActionSchema,
  comparisonReasonSchema,
  comparisonSchema,
  documentTypeSchema,
  gapKindSchema,
  reviewActionSchema,
  reviewStateSchema,
  versionStatusSchema,
} from './types.js';

/**
 * HTTP contracts shared by the API and the web app. JSON is camelCase; timestamps are ISO 8601
 * strings.
 */

const timestampSchema = z.iso.datetime({ offset: true });
const countSchema = z.number().int().nonnegative();

/** Response of GET /documents/:id/progress, and the `progress` of each list item. */
export const reviewProgressSchema = z.object({
  pending: countSchema,
  approved: countSchema,
  corrected: countSchema,
  carriedOver: countSchema,
  /** Values with no value (gaps). Counted in addition to their review state, not instead of it. */
  gaps: countSchema,
  total: countSchema,
});
export type ReviewProgress = z.infer<typeof reviewProgressSchema>;

/** Text fields of the multipart POST /documents form (the PDF goes in the `file` part). */
export const createDocumentFieldsSchema = z.object({
  type: documentTypeSchema,
  title: z.string().trim().min(1).max(200).optional(),
});
export type CreateDocumentFields = z.infer<typeof createDocumentFieldsSchema>;

/** 202 response of POST /documents and POST /documents/:id/versions */
export const uploadAcceptedSchema = z.object({
  documentId: z.uuid(),
  versionId: z.uuid(),
  versionNo: z.number().int().positive(),
  status: z.literal('queued'),
});
export type UploadAccepted = z.infer<typeof uploadAcceptedSchema>;

/** 202 response of POST /documents/:id/retry */
export const retryAcceptedSchema = z.object({
  versionId: z.uuid(),
  status: z.literal('queued'),
});
export type RetryAccepted = z.infer<typeof retryAcceptedSchema>;

/** Item of GET /documents */
export const documentSummarySchema = z.object({
  id: z.uuid(),
  type: documentTypeSchema,
  title: z.string(),
  currentVersionNo: z.number().int().positive(),
  status: versionStatusSchema,
  /** The current version's error (e.g. why extraction failed); null otherwise. */
  error: z.string().nullable(),
  progress: reviewProgressSchema,
  updatedAt: timestampSchema,
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

export const documentListSchema = z.object({ documents: z.array(documentSummarySchema) });
export type DocumentList = z.infer<typeof documentListSchema>;

export const reviewSchema = z.object({
  action: reviewActionSchema,
  correctedValue: z.string().nullable(),
  note: z.string().nullable(),
  reviewer: z.string(),
  createdAt: timestampSchema,
});
export type Review = z.infer<typeof reviewSchema>;

/** The same field on the version this value was re-extracted from. */
export const previousValueSchema = z.object({
  /** The baseline version this value came from. */
  versionNo: z.number().int().positive(),
  value: z.string().nullable(),
  evidence: z.string().nullable(),
  latestReview: reviewSchema.nullable(),
});
export type PreviousValue = z.infer<typeof previousValueSchema>;

/** One extracted field; also the 201 response of POST /values/:id/review */
export const extractedValueSchema = z.object({
  id: z.uuid(),
  field: z.string(),
  /** As written in the document. */
  value: z.string().nullable(),
  /** Canonical form by field type, e.g. "2025-03-01", "5230.29 USD", "4.2". */
  normalizedValue: z.string().nullable(),
  /** The exact passage from this version's parsed text. */
  evidence: z.string().nullable(),
  /** Where the evidence sits in the version's parsed text (end exclusive), for highlighting. */
  evidenceStart: z.number().int().nonnegative().nullable(),
  evidenceEnd: z.number().int().positive().nullable(),
  gapReason: z.string().nullable(),
  gapKind: gapKindSchema.nullable(),
  /** Compared with the same field on the baseline version (see README: re-extraction). */
  comparison: comparisonSchema,
  comparisonReason: comparisonReasonSchema.nullable(),
  carriedOver: z.boolean(),
  reviewState: reviewStateSchema,
  /** For carried-over values: the carried review's outcome. */
  carriedAction: carriedActionSchema.nullable(),
  latestReview: reviewSchema.nullable(),
  previous: previousValueSchema.nullable(),
});
export type ExtractedValue = z.infer<typeof extractedValueSchema>;

export const versionSummarySchema = z.object({
  versionNo: z.number().int().positive(),
  status: versionStatusSchema,
  createdAt: timestampSchema,
});
export type VersionSummary = z.infer<typeof versionSummarySchema>;

/** Response of GET /documents/:id */
export const documentDetailSchema = z.object({
  document: z.object({
    id: z.uuid(),
    type: documentTypeSchema,
    title: z.string(),
    currentVersionNo: z.number().int().positive(),
    createdAt: timestampSchema,
  }),
  version: z.object({
    id: z.uuid(),
    versionNo: z.number().int().positive(),
    status: versionStatusSchema,
    error: z.string().nullable(),
    /** The earlier extracted version this one was compared against (null for the first). */
    baselineVersionNo: z.number().int().positive().nullable(),
    /** This version's text exactly as parsed (evidence offsets point into it); null until extracted. */
    parsedText: z.string().nullable(),
    createdAt: timestampSchema,
  }),
  versions: z.array(versionSummarySchema),
  values: z.array(extractedValueSchema),
});
export type DocumentDetail = z.infer<typeof documentDetailSchema>;

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'BAD_REQUEST',
  'INTERNAL_ERROR',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Every non-2xx response has this shape. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
