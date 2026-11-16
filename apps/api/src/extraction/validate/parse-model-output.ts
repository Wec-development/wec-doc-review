import { type DocumentType, EXPECTED_FIELDS } from '@doc-review/shared';
import { z } from 'zod';
import { RetryableError } from '../errors.js';

/** One entry of the model's structured output (snake_case, as in the JSON schema we send). */
const modelFieldSchema = z.object({
  field: z.string(),
  value: z.string().nullable(),
  evidence: z.string().nullable(),
  not_found_reason: z.string().nullable(),
});
export type ModelField = z.infer<typeof modelFieldSchema>;

const modelOutputSchema = z.object({ fields: z.array(z.unknown()) });

/**
 * Validates the model's output and lines it up with the expected fields. The whole output being
 * malformed is retryable (a fresh sample usually fixes it). Individual entries are lenient:
 * unknown fields and malformed entries are ignored, duplicates keep the first, and an expected
 * field with no entry maps to `undefined` (it becomes a "Not returned by the model" gap).
 */
export function parseModelOutput(
  documentType: DocumentType,
  output: unknown,
): Map<string, ModelField | undefined> {
  const parsed = modelOutputSchema.safeParse(output);
  if (!parsed.success) {
    throw new RetryableError(
      `Model output did not match the expected shape: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
    );
  }

  const expected = new Set(EXPECTED_FIELDS[documentType].map((f) => f.field));
  const byField = new Map<string, ModelField | undefined>(
    [...expected].map((field) => [field, undefined]),
  );
  for (const entry of parsed.data.fields) {
    const field = modelFieldSchema.safeParse(entry);
    if (field.success && expected.has(field.data.field) && !byField.get(field.data.field)) {
      byField.set(field.data.field, field.data);
    }
  }
  return byField;
}
