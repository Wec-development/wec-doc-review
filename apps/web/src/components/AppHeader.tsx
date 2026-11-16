import { NavLink } from 'react-router';
import styles from './AppHeader.module.css';

export function AppHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <NavLink to="/" className={styles.brand} aria-label="Review Desk, all documents">
          <span className={styles.logo} aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <path d="M14 3v6h6" />
              <path d="m9 15 2 2 4-4" />
            </svg>
          </span>
          Review Desk
        </NavLink>
        <nav aria-label="Main" className={styles.nav}>
          <NavLink
            to="/welcome"
            className={({ isActive }) => (isActive ? styles.active : styles.link)}
          >
            How it works
          </NavLink>
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? styles.active : styles.link)}
          >
            Documents
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? styles.active : styles.link)}
          >
            Settings
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
