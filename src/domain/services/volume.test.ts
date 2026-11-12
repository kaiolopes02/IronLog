import { describe, expect, it } from 'vitest';
import { indexByMuscle, setVolumeKg, volumeLoadKg, weeklyVolume } from '@/domain/services/volume';
import type { Exercise } from '@/domain/entities';
import { SET_TYPES, makeSet } from '../../../tests/factories';

const exercises: Exercise[] = [
  {
    id: 'bb-bench',
    nameKey: 'exerciseNames.bb-bench',
    muscleGroupId: 'chest',
    secondaryMuscleIds: [],
    equipmentId: 'barbell',
    movementPatternId: 'horizontal-push',
    defaultRestSec: 150,
    incrementKg: 2.5,
    isCustom: false,
  },
  {
    id: 'back-squat',
    nameKey: 'exerciseNames.back-squat',
    muscleGroupId: 'quads',
    secondaryMuscleIds: [],
    equipmentId: 'barbell',
    movementPatternId: 'squat',
    defaultRestSec: 180,
    incrementKg: 2.5,
    isCustom: false,
  },
];

describe('volume', () => {
  it('ignores pending sets', () => {
    expect(setVolumeKg(makeSet({ completed: false }), SET_TYPES)).toBe(0);
  });

  it('ignores warm-up sets', () => {
    expect(setVolumeKg(makeSet({ setTypeId: 'warmup' }), SET_TYPES)).toBe(0);
  });

  it('multiplies load by reps and converts pounds', () => {
    expect(setVolumeKg(makeSet({ weight: 100, reps: 5 }), SET_TYPES)).toBe(500);
    expect(setVolumeKg(makeSet({ weight: 100, unit: 'lb', reps: 1 }), SET_TYPES)).toBeCloseTo(45.36, 2);
  });

  it('sums volume load for a session', () => {
    const sets = [makeSet({ weight: 100, reps: 5 }), makeSet({ weight: 80, reps: 10 })];
    expect(volumeLoadKg(sets, SET_TYPES)).toBe(1300);
  });

  it('groups volume by primary muscle', () => {
    const sets = [
      makeSet({ exerciseId: 'bb-bench', weight: 100, reps: 5 }),
      makeSet({ exerciseId: 'back-squat', weight: 100, reps: 3 }),
    ];
    expect(indexByMuscle(sets, exercises, SET_TYPES)).toEqual({ chest: 500, quads: 300 });
  });

  it('buckets the last weeks oldest-first', () => {
    const now = Date.UTC(2024, 5, 12);
    const sets = [
      makeSet({ completedAt: now, weight: 100, reps: 5 }),
      makeSet({ completedAt: now - 7 * 86_400_000, weight: 100, reps: 2 }),
    ];
    const weeks = weeklyVolume(sets, exercises, SET_TYPES, 4, now, 1);
    expect(weeks).toHaveLength(4);
    expect(weeks[3].totalKg).toBe(500);
    expect(weeks[2].totalKg).toBe(200);
    expect(weeks[0].totalKg).toBe(0);
  });
});
