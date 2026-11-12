import { describe, expect, it } from 'vitest';
import { chartHint } from '@/features/analytics/chart-hint';

describe('chartHint', () => {
  it('asks for a set that counts for a PR when there is none', () => {
    expect(chartHint(0, 0, 0)).toBe('needWorkSet');
  });

  it('explains that zero load produces no estimate', () => {
    expect(chartHint(2, 0, 0)).toBe('needLoad');
  });

  it('asks for another day when only one day was plotted', () => {
    expect(chartHint(2, 2, 1)).toBe('oneDay');
  });

  it('is silent once there is a line to draw', () => {
    expect(chartHint(2, 2, 3)).toBeNull();
  });
});
