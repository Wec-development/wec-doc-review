import { describe, expect, it } from 'vitest';
import { normaliseValue } from './normalise-value.js';

describe('normaliseValue', () => {
  it.each([
    ['March 1, 2025', '2025-03-01'],
    ['Mar. 1st, 2025', '2025-03-01'],
    ['1 March 2025', '2025-03-01'],
    ['2025-09-14', '2025-09-14'],
    ['03/01/2025', '2025-03-01'],
  ])('date %s -> %s', (raw, expected) => {
    expect(normaliseValue('date', raw)).toBe(expected);
  });

  it('rejects impossible or ambiguous dates', () => {
    expect(normaliseValue('date', 'February 30, 2025')).toBeNull();
    expect(normaliseValue('date', 'upon receipt')).toBeNull();
    expect(normaliseValue('date', 'March 1, 2025 to March 2, 2025')).toBeNull();
  });

  it.each([
    ['$5,230.29', '5230.29 USD'],
    ['$1,985', '1985 USD'],
    ['$2,350.00', '2350 USD'],
    ['EUR 1.200,50', null], // European decimal comma is not guessed at
    ['€ 99.90', '99.9 EUR'],
    ['1,250', '1250'],
  ])('money %s -> %s', (raw, expected) => {
    expect(normaliseValue('money', raw)).toBe(expected);
  });

  it.each([
    ['4.2%', '4.2'],
    ['3.80 %', '3.8'],
    ['5 percent', '5'],
  ])('percent %s -> %s', (raw, expected) => {
    expect(normaliseValue('percent', raw)).toBe(expected);
  });

  it.each([
    ['twenty-four (24)', '24'],
    ['24 months', '24'],
    ['twenty-four', '24'],
    ['one hundred twelve', '112'],
    ['1,200', '1200'],
  ])('number %s -> %s', (raw, expected) => {
    expect(normaliseValue('number', raw)).toBe(expected);
  });

  it('rejects numbers that are missing or contradictory', () => {
    expect(normaliseValue('number', 'about a year')).toBeNull();
    expect(normaliseValue('number', '12 or 24')).toBeNull();
  });

  it('collapses whitespace in strings', () => {
    expect(normaliseValue('string', '  Dana\n Okafor ')).toBe('Dana Okafor');
    expect(normaliseValue('string', '   ')).toBeNull();
  });
});
