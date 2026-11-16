import type { VersionSummary } from '@doc-review/shared';
import { Link } from 'react-router';
import styles from './VersionSwitcher.module.css';

interface VersionSwitcherProps {
  documentId: string;
  versions: VersionSummary[];
  selectedNo: number;
  currentNo: number;
}

function label(version: VersionSummary, currentNo: number): string {
  if (version.versionNo === currentNo) return `v${version.versionNo} · current`;
  const date = new Date(version.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `v${version.versionNo} · ${date}`;
}

/** Links between versions (navigation, so links rather than tabs); the shown one is marked current. */
export function VersionSwitcher({
  documentId,
  versions,
  selectedNo,
  currentNo,
}: VersionSwitcherProps) {
  if (versions.length < 2) return null;
  return (
    <nav aria-label="Versions">
      <ul className={styles.switcher}>
        {versions.map((version) => {
          const selected = version.versionNo === selectedNo;
          const href =
            version.versionNo === currentNo
              ? `/documents/${documentId}`
              : `/documents/${documentId}?version=${version.versionNo}`;
          return (
            <li key={version.versionNo}>
              <Link
                to={href}
                className={selected ? styles.selected : styles.option}
                aria-current={selected ? 'page' : undefined}
              >
                {label(version, currentNo)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
