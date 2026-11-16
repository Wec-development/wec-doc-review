import { describe, expect, it } from 'vitest';
import { backoffMs, MAX_BACKOFF_MS } from './backoff.js';

describe('backoffMs', () => {
  it('doubles with each attempt', () => {
    const noJitter = () => 1;
    expect([1, 2, 3, 4].map((attempt) => backoffMs(attempt, 2000, noJitter))).toEqual([
      2000, 4000, 8000, 16000,
    ]);
  });

  it('adds jitter between 50% and 100% of the exponential delay', () => {
    expect(backoffMs(3, 2000, () => 0)).toBe(4000);
    expect(backoffMs(3, 2000, () => 0.5)).toBe(6000);
    expect(backoffMs(3, 2000, () => 1)).toBe(8000);
  });

  it('is capped at five minutes', () => {
    expect(backoffMs(30, 2000, () => 1)).toBe(MAX_BACKOFF_MS);
  });

  it('is zero when the base is zero', () => {
    expect(backoffMs(2, 0)).toBe(0);
  });
});
