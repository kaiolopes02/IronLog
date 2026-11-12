import type { RestTimerState } from '@/domain/entities';

/**
 * The timer only stores an absolute end timestamp, so closing the tab,
 * backgrounding the app or throttling the JS thread cannot drift it.
 */
export interface TimerInput {
  durationSec: number;
  endsAt: number | null;
}

export function idleTimer(durationSec: number): RestTimerState {
  return { durationSec, endsAt: null, exerciseId: null };
}

export function startTimer(now: number, durationSec: number, exerciseId: string | null = null): RestTimerState {
  const safe = Math.max(1, Math.round(durationSec));
  return { durationSec: safe, endsAt: now + safe * 1000, exerciseId };
}

export function remainingMs(timer: TimerInput, now: number): number {
  if (timer.endsAt === null) return 0;
  return Math.max(0, timer.endsAt - now);
}

export function isRunning(timer: TimerInput, now: number): boolean {
  return timer.endsAt !== null && timer.endsAt > now;
}

export function isElapsed(timer: TimerInput, now: number): boolean {
  return timer.endsAt !== null && timer.endsAt <= now;
}

/** Adds or removes seconds. Negative values shrink, never below `now`. */
export function shiftTimer(
  timer: TimerInput,
  seconds: number,
  now: number,
): TimerInput & { endsAt: number | null } {
  if (timer.endsAt === null) return { ...timer };
  const next = timer.endsAt + seconds * 1000;
  return {
    ...timer,
    endsAt: Math.max(now, next),
    durationSec: Math.max(1, timer.durationSec + seconds),
  };
}

export function progress(timer: TimerInput, now: number): number {
  if (timer.endsAt === null) return 0;
  const total = timer.durationSec * 1000;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remainingMs(timer, now) / total));
}

export const TIMER_IDLE: RestTimerState = { durationSec: 0, endsAt: null, exerciseId: null };
