import type { PlateStockItem } from '@/domain/entities';

export interface PlateSideItem {
  plateId: string;
  weightKg: number;
  count: number;
}

export interface PlateSolution {
  /** Plates loaded on ONE side of the bar. */
  perSide: PlateSideItem[];
  perSideKg: number;
  leftoverPerSideKg: number;
  achievable: boolean;
}

/**
 * Greedy largest-first distribution. It is exact for standard plate sets
 * (any stack built from 25/20/15/10/5/2.5/1.25 in pairs) and reports the
 * remainder when the inventory cannot reach the target.
 */
export function distributePlates(
  targetTotalKg: number,
  barWeightKg: number,
  stock: readonly PlateStockItem[],
): PlateSolution {
  const empty: PlateSolution = {
    perSide: [],
    perSideKg: 0,
    leftoverPerSideKg: 0,
    achievable: true,
  };
  if (!Number.isFinite(targetTotalKg) || targetTotalKg <= 0) return empty;
  if (targetTotalKg <= barWeightKg) {
    return { ...empty, leftoverPerSideKg: 0, achievable: targetTotalKg === barWeightKg };
  }

  let remaining = (targetTotalKg - barWeightKg) / 2;
  const available = [...stock]
    .filter((item) => item.weightKg > 0 && item.pairs > 0)
    .sort((a, b) => b.weightKg - a.weightKg);

  const perSide: PlateSideItem[] = [];
  for (const item of available) {
    const count = Math.min(item.pairs * 2, Math.floor(remaining / item.weightKg + 1e-9));
    if (count <= 0) continue;
    perSide.push({ plateId: item.id, weightKg: item.weightKg, count });
    remaining -= count * item.weightKg;
    if (remaining < 1e-9) break;
  }

  const leftover = Math.max(0, Math.round(remaining * 100) / 100);
  const perSideKg = Math.round((perSide.reduce((sum, item) => sum + item.weightKg * item.count, 0)) * 100) / 100;
  return { perSide, perSideKg, leftoverPerSideKg: leftover, achievable: leftover < 1e-9 };
}

/** Total bar weight for a target load, useful for display and tests. */
export function loadTotalKg(barWeightKg: number, solution: PlateSolution): number {
  return Math.round((barWeightKg + solution.perSideKg * 2) * 100) / 100;
}
