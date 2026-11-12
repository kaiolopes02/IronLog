import { describe, expect, it } from 'vitest';
import { brzycki, epley, estimateOneRepMax, getFormula } from '@/domain/services/one-rep-max';

describe('one rep max', () => {
  it('returns the load itself for a single rep', () => {
    expect(epley.estimate(100, 1)).toBe(100);
    expect(brzycki.estimate(100, 1)).toBe(100);
  });

  it('estimates with Epley', () => {
    expect(estimateOneRepMax(100, 10, 'epley')).toBe(133.3);
  });

  it('estimates with Brzycki', () => {
    expect(estimateOneRepMax(100, 10, 'brzycki')).toBe(133.3);
  });

  it('degrades safely for invalid input', () => {
    expect(estimateOneRepMax(0, 10)).toBe(0);
    expect(estimateOneRepMax(100, 0)).toBe(0);
    expect(estimateOneRepMax(Number.NaN, 5)).toBe(0);
  });

  it('falls back to Epley for unknown ids', () => {
    expect(getFormula('unknown').id).toBe('epley');
  });
});
