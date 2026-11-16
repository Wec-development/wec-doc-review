import { z } from 'zod';

/**
 * What an extractor (the Step 5 fake, the Step 6 LLM) must return for one document version.
 * The worker validates every result with this schema before writing anything, so invalid
 * extractor output fails the job instead of reaching the database.
 */

/** One field: a value with its verbatim evidence, or a gap (no value) with a reason. */
export const extractedFieldSchema = z
  .object({
    field: z.string().min(1),
    value: z.string().nullable(),
    evidence: z.string().nullable(),
    gapReason: z.string().nullable(),
  })
  .refine(
    (f) => (f.value !== null && f.evidence !== null) || (f.value === null && f.gapReason !== null),
    { message: 'A field needs a value with evidence, or no value with a gap reason' },
  );
export type ExtractedField = z.infer<typeof extractedFieldSchema>;

export const extractionResultSchema = z.object({
  fields: z
    .array(extractedFieldSchema)
    .refine((fields) => new Set(fields.map((f) => f.field)).size === fields.length, {
      message: 'Each field may appear only once',
    }),
  /** Kept on the job for debugging. */
  prompt: z.string(),
  /** The provider's raw response, kept on the job for debugging. */
  rawResponse: z.unknown(),
  /** The version's parsed text, stored on the version (null if the extractor has none). */
  parsedText: z.string().nullable(),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
