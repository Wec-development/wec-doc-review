import type { ReviewAction, VersionStatus } from '@doc-review/shared';
import { eq } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { documentVersions, extractedValues, reviews } from '../db/schema.js';

export interface ValueOwnership {
  valueId: string;
  versionId: string;
  versionNo: number;
  versionStatus: VersionStatus;
  documentId: string;
}

export async function findValueOwnership(
  db: Executor,
  valueId: string,
): Promise<ValueOwnership | undefined> {
  const [row] = await db
    .select({
      valueId: extractedValues.id,
      versionId: documentVersions.id,
      versionNo: documentVersions.versionNo,
      versionStatus: documentVersions.status,
      documentId: documentVersions.documentId,
    })
    .from(extractedValues)
    .innerJoin(documentVersions, eq(documentVersions.id, extractedValues.versionId))
    .where(eq(extractedValues.id, valueId));
  return row;
}

/** Appends a review; the extracted value itself is never modified. */
export async function insertReview(
  db: Executor,
  input: {
    valueId: string;
    action: ReviewAction;
    correctedValue: string | null;
    note: string | null;
  },
): Promise<void> {
  await db.insert(reviews).values(input);
}
