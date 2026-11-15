import type {
  DocumentDetail,
  DocumentSummary,
  ExtractedValue,
  Review,
  VersionSummary,
} from '@doc-review/shared';
import type { VersionRow } from '../repositories/documents.repository.js';
import type {
  DocumentSummaryView,
  ReviewView,
  ValueView,
} from '../repositories/read-models.repository.js';
import type { DocumentDetailView } from '../services/documents.service.js';

/** Maps service read models to the JSON contracts in packages/shared (Dates -> ISO strings). */

function toReviewDto(review: ReviewView | null): Review | null {
  return review && { ...review, createdAt: review.createdAt.toISOString() };
}

export function toValueDto(value: ValueView): ExtractedValue {
  return {
    id: value.id,
    field: value.field,
    value: value.value,
    evidence: value.evidence,
    gapReason: value.gapReason,
    carriedOver: value.carriedOver,
    reviewState: value.reviewState,
    latestReview: toReviewDto(value.latestReview),
    previous: value.previous && {
      value: value.previous.value,
      evidence: value.previous.evidence,
      latestReview: toReviewDto(value.previous.latestReview),
    },
  };
}

function toVersionSummaryDto(version: VersionRow): VersionSummary {
  return {
    versionNo: version.versionNo,
    status: version.status,
    createdAt: version.createdAt.toISOString(),
  };
}

export function toDocumentDetailDto(detail: DocumentDetailView): DocumentDetail {
  const { document, version } = detail;
  return {
    document: {
      id: document.id,
      type: document.type,
      title: document.title,
      currentVersionNo: document.currentVersionNo,
      createdAt: document.createdAt.toISOString(),
    },
    version: {
      id: version.id,
      versionNo: version.versionNo,
      status: version.status,
      error: version.error,
      createdAt: version.createdAt.toISOString(),
    },
    versions: detail.versions.map(toVersionSummaryDto),
    values: detail.values.map(toValueDto),
  };
}

export function toDocumentSummaryDto(summary: DocumentSummaryView): DocumentSummary {
  return { ...summary, updatedAt: summary.updatedAt.toISOString() };
}
