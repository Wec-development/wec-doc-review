import styles from './Extracting.module.css';

interface PdfPanelProps {
  url: string;
  versionNo: number;
  /** Wide layout: the panel stays in view beside the progress. */
  sticky: boolean;
}

/** The uploaded PDF itself, in the browser's own viewer, while its text is being extracted. */
export function PdfPanel({ url, versionNo, sticky }: PdfPanelProps) {
  return (
    <aside
      className={`${styles.pdfPanel} ${sticky ? styles.sticky : ''}`}
      aria-labelledby="uploaded-pdf-title"
      data-sticky={sticky ? 'document-panel' : undefined}
    >
      <div className={styles.pdfHead}>
        <h2 id="uploaded-pdf-title" className={styles.pdfTitle}>
          Uploaded PDF · v{versionNo}
        </h2>
        <a className={styles.pdfLink} href={url} target="_blank" rel="noreferrer">
          Open in new tab<span className="visually-hidden"> (PDF, version {versionNo})</span>
        </a>
      </div>
      <iframe className={styles.pdfFrame} src={url} title={`Uploaded PDF, version ${versionNo}`} />
    </aside>
  );
}
