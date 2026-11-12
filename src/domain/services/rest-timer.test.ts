import { describe, expect, it } from 'vitest';
import {
  idleTimer,
  isElapsed,
  isRunning,
  progress,
  remainingMs,
  shiftTimer,
  startTimer,
} from '@/domain/services/rest-timer';

describe('rest timer', () => {
  it('derives everything from an absolute end timestamp', () => {
    const timer = startTimer(1_000, 90, 'bb-bench');
    expect(timer.endsAt).toBe(91_000);
    expect(remainingMs(timer, 1_000)).toBe(90_000);
    expect(remainingMs(timer, 91_000)).toBe(0);
    expect(isRunning(timer, 50_000)).toBe(true);
    expect(isElapsed(timer, 91_001)).toBe(true);
  });

  it('never reports negative time', () => {
    const timer = startTimer(1_000, 30);
    expect(remainingMs(timer, 999_999)).toBe(0);
  });

  it('shifts by seconds while keeping a floor at now', () => {
    const timer = startTimer(1_000, 60);
    const later = shiftTimer(timer, 15, 1_000);
    expect(later.endsAt).toBe(76_000);
    expect(later.durationSec).toBe(75);

    const shrunk = shiftTimer(timer, -15, 1_000);
    expect(shrunk.endsAt).toBe(46_000);
    expect(shrunk.durationSec).toBe(45);
  });

  it('clamps a negative shift to the current instant', () => {
    const timer = startTimer(1_000, 10);
    expect(shiftTimer(timer, -60, 11_000).endsAt).toBe(11_000);
  });

  it('is idle without an end timestamp', () => {
    const timer = idleTimer(90);
    expect(isRunning(timer, 0)).toBe(false);
    expect(progress(timer, 0)).toBe(0);
  });

  it('reports progress between 0 and 1', () => {
    const timer = startTimer(0, 100);
    expect(progress(timer, 50_000)).toBeCloseTo(0.5, 5);
    expect(progress(timer, 200_000)).toBe(1);
  });
});
