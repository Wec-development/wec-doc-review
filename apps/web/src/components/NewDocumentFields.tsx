import { DOCUMENT_TYPES, type DocumentType } from '@doc-review/shared';
import styles from './UploadDialog.module.css';

const TYPE_LABELS: Record<DocumentType, string> = {
  invoice: 'Invoice',
  lease: 'Lease',
  market_report: 'Market report',
};

interface NewDocumentFieldsProps {
  type: DocumentType;
  title: string;
  /** Only for a single file: with several, each document is titled from its file name. */
  showTitle: boolean;
  onTypeChange: (type: DocumentType) => void;
  onTitleChange: (title: string) => void;
}

/** Type (chosen manually, applies to every file) and the optional title of a single file. */
export function NewDocumentFields({
  type,
  title,
  showTitle,
  onTypeChange,
  onTitleChange,
}: NewDocumentFieldsProps) {
  return (
    <div className={styles.fieldRow}>
      <div className={styles.field}>
        <label htmlFor="doc-type" className={styles.label}>
          Document type <span className={styles.required}>*</span>
        </label>
        <select
          id="doc-type"
          className={`${styles.control} ${styles.select}`}
          value={type}
          onChange={(event) =>
            onTypeChange(
              DOCUMENT_TYPES.find((option) => option === event.target.value) ?? 'invoice',
            )
          }
        >
          {DOCUMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        {showTitle ? (
          <>
            <label htmlFor="doc-title" className={styles.label}>
              Title <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="doc-title"
              className={styles.control}
              type="text"
              value={title}
              placeholder="Defaults to the file name"
              onChange={(event) => onTitleChange(event.target.value)}
            />
          </>
        ) : (
          <>
            <span className={styles.label}>Title</span>
            <p className={`${styles.control} ${styles.controlNote}`}>
              Each document is named after its file
            </p>
          </>
        )}
      </div>
    </div>
  );
}
