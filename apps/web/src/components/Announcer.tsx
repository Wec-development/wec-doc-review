import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import styles from './Announcer.module.css';

type Announce = (message: string) => void;

const AnnouncerContext = createContext<Announce>(() => undefined);

const TOAST_MS = 4000;

/**
 * One polite live region for the whole app: status changes and saved reviews are announced to
 * screen readers and shown as a short visible toast.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);

  const announce = useCallback<Announce>((text) => {
    setMessage({ text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div className={styles.region} role="status" aria-live="polite" aria-atomic="true">
        {message && (
          <div key={message.id} className={styles.toast}>
            {message.text}
          </div>
        )}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnounce(): Announce {
  return useContext(AnnouncerContext);
}
