import type { DocumentDetail, ReviewProgress } from '@doc-review/shared';
import { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../../api/client.js';
import { useReviewValue } from '../../api/queries.js';
import { useAnnounce } from '../../components/Announcer.js';
import { DocumentText, type JumpRequest } from '../../components/DocumentText.js';
import type { ReviewActions } from '../../components/review-actions.js';
import { StickyReviewBar } from '../../components/StickyReviewBar.js';
import { useMediaQuery, WIDE_LAYOUT_QUERY } from '../../hooks/useMediaQuery.js';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { fieldKind } from '../../lib/format-value.js';
import { groupValues } from '../../lib/group-values.js';
import { emptyFilterMessage, filterValues, type StatusFilter } from '../../lib/status-filter.js';
import { valueHighlights } from '../../lib/highlight.js';
import { reviewSavedMessage } from '../../lib/messages.js';
import styles from '../Page.module.css';
import { ValueSections } from './ValueSections.js';

const EMPHASIS_MS = 1600;

/**
 * After choosing a status filter, bring the top of the filtered list into view if the reviewer
 * had scrolled past it (scroll-padding keeps it below the sticky header and bar).
 */
function showValuesFromTop(smooth: boolean) {
  const column = document.getElementById('extracted-values');
  if (column && column.getBoundingClientRect().top < 0) {
    column.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  }
}

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
  const [jumpTo, setJumpTo] = useState<JumpRequest | null>(null);
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);

  useEffect(() => {
    if (emphasised === null) return undefined;
    const timer = setTimeout(() => setEmphasised(null), EMPHASIS_MS);
    return () => clearTimeout(timer);
  }, [emphasised]);

  const [filter, setFilter] = useState<StatusFilter>('all');
  const smooth = !usePrefersReducedMotion();
  const visible = useMemo(() => filterValues(detail.values, filter), [detail.values, filter]);
  const groups = useMemo(() => groupValues(visible), [visible]);
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
      // The panel scrolls itself to the quote (see DocumentText): never the page when sticky.
      setJumpTo((previous) => ({ key: valueId, seq: (previous?.seq ?? 0) + 1 }));
      setEmphasised(valueId);
    },
  };

  return (
    <>
      {progress && (
        <StickyReviewBar
          detail={detail}
          progress={progress}
          filter={filter}
          onFilterChange={(next) => {
            setFilter(next);
            showValuesFromTop(smooth);
          }}
        />
      )}
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
          emptyMessage={emptyFilterMessage(filter)}
        />
        {parsedText !== null && (
          <DocumentText
            text={parsedText}
            versionNo={detail.version.versionNo}
            ranges={ranges}
            emphasisedKey={emphasised}
            jumpTo={jumpTo}
            sticky={wide}
          />
        )}
      </div>
    </>
  );
}
