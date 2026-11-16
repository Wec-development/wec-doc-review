export const DOCUMENTS_PER_PAGE = 25;

export interface Page<T> {
  items: T[];
  /** 1-based, clamped to the pages that exist. */
  page: number;
  pageCount: number;
  /** 1-based positions of the first and last item shown (0 and 0 when empty). */
  from: number;
  to: number;
  total: number;
}

/** Reads ?page= leniently: anything that is not a positive whole number means page 1. */
export function parsePage(raw: string | null): number {
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** One page of a list; a page past the end shows the last page instead of nothing. */
export function paginate<T>(items: readonly T[], requested: number, perPage: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, requested), pageCount);
  const start = (page - 1) * perPage;
  const shown = items.slice(start, start + perPage);
  return {
    items: shown,
    page,
    pageCount,
    from: shown.length > 0 ? start + 1 : 0,
    to: start + shown.length,
    total,
  };
}

/**
 * Page numbers to show, with gaps as 'gap': always the first and last page, and the current
 * page with one neighbour each side, e.g. 1 … 4 5 6 … 12.
 */
export function pageNumbers(page: number, pageCount: number): (number | 'gap')[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  for (const n of pages) {
    const previous = result.at(-1);
    if (typeof previous === 'number' && n - previous === 2) result.push(n - 1);
    else if (typeof previous === 'number' && n - previous > 2) result.push('gap');
    result.push(n);
  }
  return result;
}
