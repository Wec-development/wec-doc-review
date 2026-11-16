import { useEffect, useState } from 'react';

function matches(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/** Follows a CSS media query (false when matchMedia is unavailable). */
export function useMediaQuery(query: string): boolean {
  const [matched, setMatched] = useState(() => matches(query));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setMatched(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matched;
}

/** Wide enough for values and document text side by side (matches the 900 px CSS breakpoint). */
export const WIDE_LAYOUT_QUERY = '(min-width: 900px)';
