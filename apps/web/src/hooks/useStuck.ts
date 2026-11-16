import { type RefObject, useEffect, useState } from 'react';

export const APP_HEADER_ID = 'app-header';

/**
 * True while a sticky element is stuck below the app header. `sentinel` is a 1px element placed
 * just above the sticky one: once it scrolls up past the header, the sticky element is stuck.
 * IntersectionObserver only (no scroll listeners); the observer's top margin follows the
 * header's height and is rebuilt if the header resizes (e.g. wraps on narrow screens).
 */
export function useStuck(sentinel: RefObject<HTMLElement | null>): boolean {
  const [stuck, setStuck] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(
    () => document.getElementById(APP_HEADER_ID)?.offsetHeight ?? 0,
  );

  useEffect(() => {
    const header = document.getElementById(APP_HEADER_ID);
    if (!header || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setHeaderHeight(header.offsetHeight));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const top = entry.rootBounds?.top ?? headerHeight;
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top < top);
      },
      { rootMargin: `-${headerHeight}px 0px 0px 0px`, threshold: [0, 1] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [sentinel, headerHeight]);

  return stuck;
}
