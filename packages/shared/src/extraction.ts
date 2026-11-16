import { z } from 'zod';

/**
 * What an extractor (the fake, or the LLM pipeline) must return for one document version.
 * The worker validates every result with this schema before writing anything, so invalid
 * extractor output fails the job instead of reaching the database.
 */

/**
 * One field: a value with its verbatim evidence, or a gap (no value) with a reason. For kept
 * values the LLM pipeline also supplies the normalised value and the evidence's position in the
 * version's raw parsed text.
 */
export const extractedFieldSchema = z
  .object({
    field: z.string().min(1),
    /** The value as written in the document. */
    value: z.string().nullable(),
    /** Type-aware canonical form (e.g. 2025-03-01, "5230.29 USD"); null for gaps. */
    normalizedValue: z.string().nullable().optional(),
    evidence: z.string().nullable(),
    /** Start/end (exclusive) of the evidence in the raw parsed text. */
    evidenceStart: z.number().int().nonnegative().nullable().optional(),
    evidenceEnd: z.number().int().positive().nullable().optional(),
    gapReason: z.string().nullable(),
  })
  .refine(
    (f) => (f.value !== null && f.evidence !== null) || (f.value === null && f.gapReason !== null),
    { message: 'A field needs a value with evidence, or no value with a gap reason' },
  )
  .refine(
    (f) =>
      (f.evidenceStart == null) === (f.evidenceEnd == null) &&
      (f.evidenceStart == null || f.evidenceEnd == null || f.evidenceEnd > f.evidenceStart),
    { message: 'Evidence offsets must be both set (start < end) or both empty' },
  );
export type ExtractedField = z.infer<typeof extractedFieldSchema>;

export const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

/** Debugging data kept on the job for every attempt that reached the model. */
export const extractionDiagnosticsSchema = z.object({
  prompt: z.string(),
  promptVersion: z.string().nullable(),
  model: z.string().nullable(),
  /** The provider's raw response; null when the call failed before a response. */
  rawResponse: z.unknown(),
  usage: tokenUsageSchema.nullable(),
  /** Duration of the model call. */
  durationMs: z.number().int().nonnegative().nullable(),
});
export type ExtractionDiagnostics = z.infer<typeof extractionDiagnosticsSchema>;

export const extractionResultSchema = extractionDiagnosticsSchema.extend({
  fields: z
    .array(extractedFieldSchema)
    .refine((fields) => new Set(fields.map((f) => f.field)).size === fields.length, {
      message: 'Each field may appear only once',
    }),
  /** The version's raw parsed text, stored on the version (null if the extractor has none). */
  parsedText: z.string().nullable(),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
