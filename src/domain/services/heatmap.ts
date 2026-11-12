import { addDays, startOfDay, startOfWeek, toDateKey } from '@/shared/utils/date';

export interface HeatmapCell {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface HeatmapModel {
  /** Column-major weeks: each inner array holds up to 7 cells (null = outside the year). */
  weeks: (HeatmapCell | null)[][];
  columnCount: number;
  monthLabels: { column: number; label: string }[];
  total: number;
}

function levelFor(count: number): HeatmapCell['level'] {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

/** Consistency heatmap for one calendar year, grouped into week columns. */
export function buildHeatmap(
  timestamps: readonly number[],
  year: number,
  weekStartsOn: 0 | 1 = 1,
): HeatmapModel {
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const key = toDateKey(ts);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const first = startOfDay(new Date(year, 0, 1).getTime());
  const last = startOfDay(new Date(year, 11, 31).getTime());
  const gridStart = startOfWeek(first, weekStartsOn);
  const leading = Math.round((first - gridStart) / 86_400_000);

  const days: HeatmapCell[] = [];
  let cursor = first;
  while (cursor <= last) {
    const date = toDateKey(cursor);
    const count = counts.get(date) ?? 0;
    days.push({ date, count, level: levelFor(count) });
    cursor = addDays(cursor, 1);
  }

  const cells: (HeatmapCell | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (HeatmapCell | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  const monthLabels: { column: number; label: string }[] = [];
  for (let month = 0; month < 12; month++) {
    const monthStart = new Date(year, month, 1).getTime();
    const offset = Math.round((monthStart - gridStart) / 86_400_000);
    const column = Math.floor(offset / 7);
    if (monthLabels.length === 0 || monthLabels[monthLabels.length - 1].column !== column) {
      monthLabels.push({ column, label: `${month + 1}` });
    }
  }

  return { weeks, columnCount: weeks.length, monthLabels, total: days.reduce((sum, day) => sum + day.count, 0) };
}
