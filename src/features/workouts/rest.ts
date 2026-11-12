import type { AppSettings, Exercise } from '@/domain/entities';

export function resolveRestSeconds(exercise: Exercise, settings: AppSettings): number {
  const byMuscle = settings.restByMuscle[exercise.muscleGroupId];
  if (typeof byMuscle === 'number' && byMuscle > 0) return byMuscle;
  if (exercise.defaultRestSec > 0) return exercise.defaultRestSec;
  return settings.restDefaultSec;
}
