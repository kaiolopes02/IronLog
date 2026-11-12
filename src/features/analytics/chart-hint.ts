export type ChartHint = 'needWorkSet' | 'needLoad' | 'oneDay' | null;

/**
 * Why the e1RM chart has no line. `prSets` are completed sets that count for a
 * PR, `loadedSets` those with load > 0 and `days` the distinct days plotted.
 */
export function chartHint(prSets: number, loadedSets: number, days: number): ChartHint {
  if (prSets === 0) return 'needWorkSet';
  if (loadedSets === 0) return 'needLoad';
  if (days < 2) return 'oneDay';
  return null;
}
