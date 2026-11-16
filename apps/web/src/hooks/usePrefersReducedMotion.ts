import { useMediaQuery } from './useMediaQuery.js';

/** Follows the OS "reduce motion" setting; components skip their animations when it is on. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
