import { useEffect } from 'react';

/** Names the screen in the browser tab and for screen readers ("Documents · Review Desk"). */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Review Desk`;
  }, [title]);
}
