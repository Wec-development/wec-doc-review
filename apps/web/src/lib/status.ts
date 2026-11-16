import type { DocumentDetail, ExtractedValue, VersionStatus } from '@doc-review/shared';

export type StatusTone = 'queued' | 'extracting' | 'extracted' | 'failed' | 'superseded';

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

const STATUS_LABELS: Record<VersionStatus, string> = {
  queued: 'Queued',
  extracting: 'Extracting',
  extracted: 'Extracted',
  failed: 'Failed',
  superseded: 'Superseded',
};

/** Label and tone for a version status. Any version older than the current one is "Superseded". */
export function statusMeta(status: VersionStatus, isOlderVersion = false): StatusMeta {
  if (isOlderVersion) return { label: 'Superseded', tone: 'superseded' };
  return { label: STATUS_LABELS[status], tone: status };
}

/** Queued or extracting: the UI keeps polling while any visible document is in this state. */
export function isInFlight(status: VersionStatus): boolean {
  return status === 'queued' || status === 'extracting';
}

export type ReviewTone = 'pending' | 'approved' | 'corrected' | 'carried' | 'gap';

/** The review badge for a value: always a text label, never colour alone. */
export function reviewMeta(value: ExtractedValue): { label: string; tone: ReviewTone } {
  switch (value.reviewState) {
    case 'carried_over':
      return value.carriedAction === 'corrected'
        ? { label: 'Carried over · corrected', tone: 'corrected' }
        : { label: 'Carried over · approved', tone: 'carried' };
    case 'approved':
      return value.value === null
        ? { label: 'Gap confirmed', tone: 'approved' }
        : { label: 'Approved', tone: 'approved' };
    case 'corrected':
      return { label: 'Corrected', tone: 'corrected' };
    case 'pending':
      return value.value === null
        ? { label: 'Gap', tone: 'gap' }
        : { label: 'Pending', tone: 'pending' };
  }
}

/** True when the page shows an older version: everything is read-only. */
export function isOlderVersion(detail: DocumentDetail): boolean {
  return detail.version.versionNo < detail.document.currentVersionNo;
}
