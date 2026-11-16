import { RateLimitedError } from '../errors.js';

/**
 * A small fixed-window limiter per client (e.g. per IP), kept in memory on purpose: it only
 * throttles abuse of one cheap endpoint, so losing the counts on restart is harmless.
 */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const windows = new Map<string, { startedAt: number; count: number }>();

  return function consume(client: string): void {
    const time = now();
    const current = windows.get(client);
    if (!current || time - current.startedAt >= options.windowMs) {
      // Drop expired windows so the map cannot grow without bound.
      for (const [key, window] of windows) {
        if (time - window.startedAt >= options.windowMs) windows.delete(key);
      }
      windows.set(client, { startedAt: time, count: 1 });
      return;
    }
    current.count += 1;
    if (current.count > options.limit) {
      throw new RateLimitedError('Too many connection tests; wait a minute and try again');
    }
  };
}
