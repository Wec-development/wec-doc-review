import { describe, expect, it } from 'vitest';
import { reviewRequestSchema } from './types.js';

describe('reviewRequestSchema', () => {
  it('accepts an approval', () => {
    expect(reviewRequestSchema.parse({ action: 'approve' })).toEqual({ action: 'approve' });
  });

  it('accepts a correction with an optional note', () => {
    const parsed = reviewRequestSchema.parse({ action: 'correct', value: '2025-11-13' });
    expect(parsed).toEqual({ action: 'correct', value: '2025-11-13' });
  });

  it('rejects a correction without a value', () => {
    expect(() => reviewRequestSchema.parse({ action: 'correct', value: '  ' })).toThrow();
  });
});
