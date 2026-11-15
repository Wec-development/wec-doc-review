import type { ReviewRequest, VersionStatus } from '@doc-review/shared';
import { ConflictError, NotFoundError } from '../errors.js';
import { findLatestVersion, lockDocument } from '../repositories/documents.repository.js';
import { findValueView, type ValueView } from '../repositories/read-models.repository.js';
import { findValueOwnership, insertReview } from '../repositories/values.repository.js';
import type { ServiceDeps } from './deps.js';

const REVIEWABLE_STATUS: VersionStatus = 'extracted';

/**
 * Appends an approve or correct review. Corrections live beside the extracted value, which is
 * never changed. Only values of the current, extracted version can be reviewed; older versions
 * are read-only. Gaps can be reviewed too (approve confirms the gap, correct supplies the value).
 */
export async function reviewValue(
  { db }: ServiceDeps,
  valueId: string,
  request: ReviewRequest,
): Promise<ValueView> {
  await db.transaction(async (tx) => {
    const ownership = await findValueOwnership(tx, valueId);
    if (!ownership) {
      throw new NotFoundError(`Value ${valueId} not found`);
    }
    // Shared lock: a new version cannot be created while this review is being written.
    await lockDocument(tx, ownership.documentId, 'share');
    const current = await findLatestVersion(tx, ownership.documentId);
    if (current?.id !== ownership.versionId) {
      throw new ConflictError(
        `Value belongs to version ${ownership.versionNo}, which is no longer current (current is ${current?.versionNo ?? '?'})`,
      );
    }
    if (ownership.versionStatus !== REVIEWABLE_STATUS) {
      throw new ConflictError(
        `Version ${ownership.versionNo} is ${ownership.versionStatus}; values can be reviewed once it is ${REVIEWABLE_STATUS}`,
      );
    }
    await insertReview(tx, {
      valueId,
      action: request.action,
      correctedValue: request.action === 'correct' ? request.value : null,
      note: request.action === 'correct' ? (request.note ?? null) : null,
    });
  });

  const updated = await findValueView(db, valueId);
  if (!updated) {
    throw new Error(`Value ${valueId} disappeared after its review was saved`);
  }
  return updated;
}
