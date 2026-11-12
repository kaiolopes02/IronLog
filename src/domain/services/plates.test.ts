import { describe, expect, it } from 'vitest';
import { distributePlates, loadTotalKg } from '@/domain/services/plates';
import { seedPlates } from '@/seed';

const stock = seedPlates.defaultStock;

describe('plate calculator', () => {
  it('splits a load evenly across both sides', () => {
    const solution = distributePlates(100, 20, stock);
    expect(solution.achievable).toBe(true);
    expect(solution.perSideKg).toBe(40);
    expect(loadTotalKg(20, solution)).toBe(100);
    expect(solution.perSide.map((plate) => plate.weightKg)).toEqual([25, 15]);
  });

  it('reports the leftover when inventory cannot reach the target', () => {
    const solution = distributePlates(101, 20, stock);
    expect(solution.achievable).toBe(false);
    expect(solution.leftoverPerSideKg).toBeCloseTo(0.5, 5);
  });

  it('handles a load equal to the bar', () => {
    expect(distributePlates(20, 20, stock)).toMatchObject({ achievable: true, perSideKg: 0 });
  });

  it('marks loads below the bar as unreachable', () => {
    expect(distributePlates(10, 20, stock).achievable).toBe(false);
  });

  it('never exceeds the available pairs', () => {
    const single = [{ id: 'p25', weightKg: 25, pairs: 1 }];
    const solution = distributePlates(500, 20, single);
    expect(solution.perSide).toHaveLength(1);
    expect(solution.perSide[0].count).toBe(2);
    expect(solution.achievable).toBe(false);
  });

  it('ignores non-positive targets', () => {
    expect(distributePlates(0, 20, stock)).toMatchObject({ achievable: true, perSide: [] });
  });
});
