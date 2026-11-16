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
  onTypeChange: (type: DocumentType) => void;
  onTitleChange: (title: string) => void;
}

/** Type (chosen manually) and optional title, for a brand-new document. */
export function NewDocumentFields({
  type,
  title,
  onTypeChange,
  onTitleChange,
}: NewDocumentFieldsProps) {
  return (
    <>
      <div className={styles.field}>
        <label htmlFor="doc-type">
          Document type <span className={styles.required}>*</span>
        </label>
        <select
          id="doc-type"
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
        <label htmlFor="doc-title">
          Title <span className={styles.optional}>(optional)</span>
        </label>
        <input
          id="doc-title"
          type="text"
          value={title}
          placeholder="Defaults to the file name"
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </div>
    </>
  );
}
