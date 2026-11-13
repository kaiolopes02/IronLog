import { describe, expect, it } from 'vitest';
import { unlockDelayMs } from '@/features/security/backoff';

describe('unlock backoff', () => {
  it('allows the first two attempts immediately', () => {
    expect(unlockDelayMs(1)).toBe(0);
    expect(unlockDelayMs(2)).toBe(0);
  });

  it('doubles from one second and caps at thirty seconds', () => {
    expect(unlockDelayMs(3)).toBe(1_000);
    expect(unlockDelayMs(4)).toBe(2_000);
    expect(unlockDelayMs(5)).toBe(4_000);
    expect(unlockDelayMs(6)).toBe(8_000);
    expect(unlockDelayMs(20)).toBe(30_000);
  });
});
