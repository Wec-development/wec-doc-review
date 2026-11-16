export const MAX_BACKOFF_MS = 5 * 60 * 1000;

/**
 * Delay before retry number `attempt` (1 = first retry): exponential, base * 2^(attempt-1),
 * with "equal jitter" (between 50% and 100% of that) so failed jobs do not retry in lockstep,
 * capped at 5 minutes.
 */
export function backoffMs(
  attempt: number,
  baseMs: number,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(baseMs * 2 ** Math.max(attempt - 1, 0), MAX_BACKOFF_MS);
  return Math.round(exponential / 2 + (exponential / 2) * random());
}
