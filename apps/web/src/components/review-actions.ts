import type { ExtractedValue, FieldKind, ReviewRequest } from '@doc-review/shared';

/** What every value card needs to render a value (no data fetching inside cards). */
export interface ValueDisplay {
  kind: FieldKind;
  versionNo: number;
  parsedText: string | null;
}

/** Review callbacks for the current version; absent on read-only (older) versions. */
export interface ReviewActions {
  /** A review is being saved: every review button is disabled (no double submits). */
  busy: boolean;
  editingId: string | null;
  startEditing: (valueId: string) => void;
  stopEditing: () => void;
  submit: (value: ExtractedValue, review: ReviewRequest) => void;
  errorFor: (valueId: string) => string | null;
  showInText: (valueId: string) => void;
}
