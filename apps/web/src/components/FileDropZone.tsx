import { type DragEvent, useState } from 'react';
import styles from './UploadDialog.module.css';
import { UploadIcon } from './UploadIcon.js';

interface FileDropZoneProps {
  multiple: boolean;
  invalid: boolean;
  onFiles: (files: File[]) => void;
}

/**
 * A real file input (keyboard and screen-reader friendly) styled as a drop zone. Dragging PDFs
 * onto it works too; the input stays the accessible way to choose files.
 */
export function FileDropZone({ multiple, invalid, onFiles }: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    onFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className={styles.field}>
      <span className={styles.label} id="doc-file-label">
        {multiple ? 'PDF files' : 'PDF file'} <span className={styles.required}>*</span>
      </span>
      <label
        className={`${styles.dropzone} ${dragging ? styles.dragging : ''} ${invalid ? styles.dropzoneInvalid : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          id="doc-file"
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          multiple={multiple}
          aria-labelledby="doc-file-label"
          aria-describedby="doc-file-hint"
          aria-invalid={invalid}
          onChange={(event) => {
            onFiles(Array.from(event.target.files ?? []));
            // Allow choosing the same file again after removing it.
            event.target.value = '';
          }}
        />
        <span className={styles.dropIcon} aria-hidden="true">
          <UploadIcon />
        </span>
        <span className={styles.dropText}>
          <strong>{multiple ? 'Drop PDFs here' : 'Drop a PDF here'}</strong> or{' '}
          <span className={styles.browse}>browse</span>
        </span>
        <span id="doc-file-hint" className={styles.hintSmall}>
          PDF only · up to 10 MB{multiple ? ' each · several at once' : ''}
        </span>
      </label>
    </div>
  );
}
