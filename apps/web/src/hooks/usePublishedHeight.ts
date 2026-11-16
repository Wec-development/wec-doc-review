import { type RefObject, useEffect } from 'react';

/**
 * Publishes an element's height as a CSS variable on <html> (e.g. --app-header-height), kept up
 * to date with a ResizeObserver, so sticky offsets and scroll padding can be computed in CSS.
 * The variable is removed again when the element unmounts.
 */
export function usePublishedHeight(ref: RefObject<HTMLElement | null>, variable: string): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(variable, `${element.offsetHeight}px`);
    publish();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => publish());
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(variable);
    };
  }, [ref, variable]);
}
