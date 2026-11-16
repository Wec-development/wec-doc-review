import type { ExtractedField } from '@doc-review/shared';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { documentVersions, extractedValues, reviews, valueReviewStates } from '../db/schema.js';
import type { BaselineValue, FieldComparison } from '../extraction/carry-over/compare-versions.js';

export interface BaselineVersion {
  id: string;
  versionNo: number;
  parsedText: string | null;
}

export interface CarryOverSummary {
  baselineVersionNo: number | null;
  unchanged: number;
  changed: number;
  added: number;
  carried: number;
}

/**
 * The latest EARLIER version of the document that finished extracting. Failed, superseded and
 * never-extracted versions are skipped (v1 extracted, v2 failed, v3 -> compared with v1).
 */
export async function findBaselineVersion(
  db: Executor,
  documentId: string,
  versionNo: number,
): Promise<BaselineVersion | undefined> {
  const [baseline] = await db
    .select({
      id: documentVersions.id,
      versionNo: documentVersions.versionNo,
      parsedText: documentVersions.parsedText,
    })
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.documentId, documentId),
        lt(documentVersions.versionNo, versionNo),
        eq(documentVersions.status, 'extracted'),
      ),
    )
    .orderBy(desc(documentVersions.versionNo))
    .limit(1);
  return baseline;
}

/** The baseline's values with their current (latest) review, from the review-state view. */
export async function loadBaselineValues(
  db: Executor,
  versionId: string,
): Promise<BaselineValue[]> {
  const rows = await db
    .select({
      id: extractedValues.id,
      field: extractedValues.field,
      value: extractedValues.value,
      normalizedValue: extractedValues.normalizedValue,
      evidence: extractedValues.evidence,
      gapKind: extractedValues.gapKind,
      reviewId: valueReviewStates.reviewId,
      reviewAction: valueReviewStates.reviewAction,
      correctedValue: valueReviewStates.correctedValue,
      note: valueReviewStates.note,
      reviewer: valueReviewStates.reviewer,
    })
    .from(extractedValues)
    .innerJoin(valueReviewStates, eq(valueReviewStates.valueId, extractedValues.id))
    .where(eq(extractedValues.versionId, versionId));

  return rows.map(({ reviewId, reviewAction, correctedValue, note, reviewer, ...value }) => ({
    ...value,
    latestReview:
      reviewId !== null && reviewAction !== null
        ? {
            id: reviewId,
            action: reviewAction,
            correctedValue,
            note,
            reviewer: reviewer ?? 'reviewer',
          }
        : null,
  }));
}

/**
 * Writes the version's values with their comparison results, then copies the carried reviews.
 * Both writes are idempotent: values on UNIQUE (version_id, field), carried reviews on the
 * partial UNIQUE (value_id, carried_from_review_id); re-running the same version changes nothing.
 */
export async function writeValuesWithCarryOver(
  db: Executor,
  versionId: string,
  fields: ExtractedField[],
  comparisons: FieldComparison[],
): Promise<void> {
  if (fields.length === 0) return;
  const byField = new Map(comparisons.map((c) => [c.field, c]));

  await db
    .insert(extractedValues)
    .values(
      fields.map((field) => {
        const comparison = byField.get(field.field);
        return {
          ...field,
          versionId,
          gapKind: field.value === null ? (field.gapKind ?? 'not_found') : null,
          comparison: comparison?.comparison ?? 'initial',
          comparisonReason: comparison?.reason ?? null,
          previousValueId: comparison?.previousValueId ?? null,
          carriedOver: comparison?.carryReview != null,
        };
      }),
    )
    .onConflictDoNothing({ target: [extractedValues.versionId, extractedValues.field] });

  const carried = comparisons.filter((c) => c.carryReview !== null);
  if (carried.length === 0) return;

  const ids = await db
    .select({ id: extractedValues.id, field: extractedValues.field })
    .from(extractedValues)
    .where(eq(extractedValues.versionId, versionId));
  const idByField = new Map(ids.map((row) => [row.field, row.id]));

  const carriedReviews = carried.flatMap(({ field, carryReview }) => {
    const valueId = idByField.get(field);
    return valueId && carryReview
      ? [
          {
            valueId,
            action: carryReview.action,
            correctedValue: carryReview.correctedValue,
            note: carryReview.note,
            reviewer: carryReview.reviewer,
            carriedFromReviewId: carryReview.id,
          },
        ]
      : [];
  });
  await db
    .insert(reviews)
    .values(carriedReviews)
    .onConflictDoNothing({
      target: [reviews.valueId, reviews.carriedFromReviewId],
      where: sql`${reviews.carriedFromReviewId} is not null`,
    });
}

export function summarise(
  comparisons: FieldComparison[],
  baseline: BaselineVersion | undefined,
): CarryOverSummary {
  const count = (kind: FieldComparison['comparison']) =>
    comparisons.filter((c) => c.comparison === kind).length;
  return {
    baselineVersionNo: baseline?.versionNo ?? null,
    unchanged: count('unchanged'),
    changed: count('changed'),
    added: count('added'),
    carried: comparisons.filter((c) => c.carryReview !== null).length,
  };
}
