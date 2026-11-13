/**
 * Delay before accepting another PIN attempt: none for the first two failures,
 * then 1 s doubling up to 30 s.
 */
export function unlockDelayMs(failures: number): number {
  if (failures < 3) return 0;
  return Math.min(30_000, 2 ** (failures - 3) * 1000);
}
