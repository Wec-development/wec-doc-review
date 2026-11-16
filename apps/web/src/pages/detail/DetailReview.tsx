import type { DocumentDetail, ReviewProgress } from '@doc-review/shared';
import { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../../api/client.js';
import { useReviewValue } from '../../api/queries.js';
import { useAnnounce } from '../../components/Announcer.js';
import { AttentionBanner } from '../../components/AttentionBanner.js';
import { DocumentText, evidenceAnchorId } from '../../components/DocumentText.js';
import type { ReviewActions } from '../../components/review-actions.js';
import { fieldKind } from '../../lib/format-value.js';
import { groupValues } from '../../lib/group-values.js';
import { valueHighlights } from '../../lib/highlight.js';
import { reviewSavedMessage } from '../../lib/messages.js';
import styles from '../Page.module.css';
import { ValueSections } from './ValueSections.js';

const EMPHASIS_MS = 1600;

/** The current, extracted version: review values beside the document text (Review / Gaps). */
export function DetailReview({
  detail,
  progress,
}: {
  detail: DocumentDetail;
  progress: ReviewProgress | undefined;
}) {
  const announce = useAnnounce();
  const review = useReviewValue(detail.document.id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [emphasised, setEmphasised] = useState<string | null>(null);

  useEffect(() => {
    if (emphasised === null) return undefined;
    const timer = setTimeout(() => setEmphasised(null), EMPHASIS_MS);
    return () => clearTimeout(timer);
  }, [emphasised]);

  const groups = useMemo(() => groupValues(detail.values), [detail.values]);
  const ranges = useMemo(() => valueHighlights(detail.values, false), [detail.values]);
  const parsedText = detail.version.parsedText;

  const actions: ReviewActions = {
    busy: review.isPending,
    editingId,
    startEditing: (valueId) => {
      review.reset();
      setEditingId(valueId);
    },
    stopEditing: () => setEditingId(null),
    submit: (value, request) =>
      review.mutate(
        { valueId: value.id, review: request },
        {
          onSuccess: () => {
            setEditingId(null);
            announce(reviewSavedMessage(value, request));
          },
        },
      ),
    errorFor: (valueId) =>
      review.isError && review.variables?.valueId === valueId ? errorMessage(review.error) : null,
    showInText: (valueId) => {
      document
        .getElementById(evidenceAnchorId(valueId))
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setEmphasised(valueId);
    },
  };

  return (
    <>
      {progress && <AttentionBanner detail={detail} progress={progress} />}
      <div className={styles.columns}>
        <ValueSections
          groups={groups}
          baselineVersionNo={detail.version.baselineVersionNo}
          display={(field) => ({
            kind: fieldKind(detail.document.type, field),
            versionNo: detail.version.versionNo,
            parsedText,
          })}
          actions={actions}
        />
        {parsedText !== null && (
          <DocumentText
            text={parsedText}
            versionNo={detail.version.versionNo}
            ranges={ranges}
            emphasisedKey={emphasised}
          />
        )}
      </div>
    </>
  );
}
