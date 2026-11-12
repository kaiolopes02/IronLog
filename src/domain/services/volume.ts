import type { Exercise, SetType, WorkoutSet } from '@/domain/entities';
import { startOfWeek, toDateKey } from '@/shared/utils/date';
import { toKg } from '@/shared/utils/units';

export function isCountable(set: WorkoutSet, setTypes: Record<string, SetType>): boolean {
  const type = setTypes[set.setTypeId];
  if (!type) return true;
  return type.countsForVolume;
}

export function setVolumeKg(set: WorkoutSet, setTypes: Record<string, SetType>): number {
  if (!set.completed) return 0;
  if (!isCountable(set, setTypes)) return 0;
  return toKg(set.weight, set.unit) * set.reps;
}

export function volumeLoadKg(
  sets: readonly WorkoutSet[],
  setTypes: Record<string, SetType>,
): number {
  return Math.round(sets.reduce((total, set) => total + setVolumeKg(set, setTypes), 0));
}

export function totalReps(sets: readonly WorkoutSet[]): number {
  return sets.reduce((total, set) => total + set.reps, 0);
}

export function indexByMuscle(
  sets: readonly WorkoutSet[],
  exercises: readonly Exercise[],
  setTypes: Record<string, SetType>,
): Record<string, number> {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const totals: Record<string, number> = {};
  for (const set of sets) {
    const exercise = exerciseById.get(set.exerciseId);
    if (!exercise) continue;
    const volume = setVolumeKg(set, setTypes);
    if (volume <= 0) continue;
    totals[exercise.muscleGroupId] = (totals[exercise.muscleGroupId] ?? 0) + volume;
  }
  return totals;
}

export interface WeekVolume {
  weekStart: number;
  totalKg: number;
  byMuscle: Record<string, number>;
}

/** Last `weeks` weeks, oldest first, week starting at `weekStartsOn`. */
export function weeklyVolume(
  sets: readonly WorkoutSet[],
  exercises: readonly Exercise[],
  setTypes: Record<string, SetType>,
  weeks: number,
  now: number = Date.now(),
  weekStartsOn: 0 | 1 = 1,
): WeekVolume[] {
  const currentWeek = startOfWeek(now, weekStartsOn);
  const buckets: WeekVolume[] = [];
  for (let index = weeks - 1; index >= 0; index--) {
    const weekStart = startOfWeek(currentWeek - index * 7 * 86_400_000, weekStartsOn);
    buckets.push({ weekStart, totalKg: 0, byMuscle: {} });
  }
  const byStart = new Map(buckets.map((bucket) => [bucket.weekStart, bucket]));

  for (const set of sets) {
    const bucket = byStart.get(startOfWeek(set.completedAt, weekStartsOn));
    if (!bucket) continue;
    const volume = setVolumeKg(set, setTypes);
    if (volume <= 0) continue;
    bucket.totalKg += volume;
    const exercise = exercises.find((item) => item.id === set.exerciseId);
    if (!exercise) continue;
    bucket.byMuscle[exercise.muscleGroupId] =
      (bucket.byMuscle[exercise.muscleGroupId] ?? 0) + volume;
  }

  return buckets.map((bucket) => ({
    ...bucket,
    totalKg: Math.round(bucket.totalKg),
    byMuscle: Object.fromEntries(
      Object.entries(bucket.byMuscle).map(([key, value]) => [key, Math.round(value)]),
    ),
  }));
}

export function setTypeIndex(setTypes: readonly SetType[]): Record<string, SetType> {
  return Object.fromEntries(setTypes.map((type) => [type.id, type]));
}

/** Daily volume keys are handy for the history screen and tests. */
export function volumeByDay(
  sets: readonly WorkoutSet[],
  setTypes: Record<string, SetType>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const set of sets) {
    const key = toDateKey(set.completedAt);
    totals[key] = (totals[key] ?? 0) + setVolumeKg(set, setTypes);
  }
  return totals;
}

export function heaviestSet(sets: readonly WorkoutSet[]): WorkoutSet | undefined {
  return sets.reduce<WorkoutSet | undefined>((best, set) => {
    if (!best) return set;
    return toKg(set.weight, set.unit) > toKg(best.weight, best.unit) ? set : best;
  }, undefined);
}
