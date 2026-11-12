import type { SetType, WorkoutSet } from '@/domain/entities';

export const WORKING_TYPE: SetType = {
  id: 'working',
  nameKey: 'setTypes.working',
  isWarmup: false,
  countsForVolume: true,
  countsForPR: true,
};

export const WARMUP_TYPE: SetType = {
  id: 'warmup',
  nameKey: 'setTypes.warmup',
  isWarmup: true,
  countsForVolume: false,
  countsForPR: false,
};

export const SET_TYPES: Record<string, SetType> = {
  working: WORKING_TYPE,
  warmup: WARMUP_TYPE,
};

let seq = 0;

export function makeSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  seq += 1;
  return {
    id: `set-${seq}`,
    sessionId: 'session-1',
    exerciseId: 'bb-bench',
    order: seq,
    setTypeId: 'working',
    weight: 100,
    unit: 'kg',
    reps: 5,
    rpe: null,
    rir: null,
    completed: true,
    completedAt: Date.UTC(2024, 0, 1) + seq * 1000,
    ...overrides,
  };
}
