import { describe, expect, it } from 'vitest';
import { buildHeatmap } from '@/domain/services/heatmap';
import { toDateKey } from '@/shared/utils/date';

describe('heatmap', () => {
  it('covers every day of a leap year', () => {
    const model = buildHeatmap([], 2024, 1);
    const cells = model.weeks.flat().filter((cell) => cell !== null);
    expect(cells).toHaveLength(366);
    expect(model.weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('counts sessions per day and assigns levels', () => {
    const day = new Date(2024, 3, 10, 12).getTime();
    const model = buildHeatmap([day, day, day, day, day], 2024, 1);
    const cell = model.weeks.flat().find((item) => item?.date === toDateKey(day));
    expect(cell?.count).toBe(5);
    expect(cell?.level).toBe(4);
    expect(model.total).toBe(5);
  });

  it('keeps zero-count days at level 0', () => {
    const model = buildHeatmap([], 2024, 1);
    expect(model.weeks.flat().filter(Boolean).every((cell) => cell?.level === 0)).toBe(true);
  });

  it('produces twelve month labels', () => {
    expect(buildHeatmap([], 2024, 1).monthLabels).toHaveLength(12);
  });
});
