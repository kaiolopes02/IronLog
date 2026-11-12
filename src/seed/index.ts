import { catalogKey } from '@/core/i18n';
import { APP_CONFIG } from '@/core/config/app.config';
import type {
  Equipment,
  Exercise,
  MetricType,
  MovementPattern,
  MuscleGroup,
  PlateStockItem,
  SetType,
  WorkoutSplit,
} from '@/domain/entities';
import exercisesJson from '@/seed/exercises.json';
import equipmentJson from '@/seed/equipment.json';
import metricTypesJson from '@/seed/metric-types.json';
import muscleGroupsJson from '@/seed/muscle-groups.json';
import movementPatternsJson from '@/seed/movement-patterns.json';
import platesJson from '@/seed/plates.json';
import setTypesJson from '@/seed/set-types.json';
import splitsJson from '@/seed/splits.json';

interface ExerciseSeed {
  id: string;
  muscleGroupId: string;
  secondaryMuscleIds: string[];
  equipmentId: string;
  movementPatternId: string;
  defaultRestSec: number;
  incrementKg: number;
}

export interface SeedCatalog {
  exercises: Exercise[];
  muscleGroups: MuscleGroup[];
  equipment: Equipment[];
  movementPatterns: MovementPattern[];
  setTypes: SetType[];
  splits: WorkoutSplit[];
  metricTypes: MetricType[];
  plates: { defaultBarWeightKg: number; defaultStock: PlateStockItem[] };
}

export const seedExercises: Exercise[] = (exercisesJson as ExerciseSeed[]).map((item) => ({
  ...item,
  nameKey: catalogKey.exercise(item.id),
  isCustom: false,
}));

export const seedMuscleGroups: MuscleGroup[] = muscleGroupsJson.map((item) => ({
  ...item,
  nameKey: catalogKey.muscle(item.id),
}));

export const seedEquipment: Equipment[] = equipmentJson.map((item) => ({
  ...item,
  nameKey: catalogKey.equipment(item.id),
}));

export const seedMovementPatterns: MovementPattern[] = movementPatternsJson.map((item) => ({
  ...item,
  nameKey: catalogKey.pattern(item.id),
}));

export const seedSetTypes: SetType[] = setTypesJson.map((item) => ({
  ...item,
  nameKey: catalogKey.setType(item.id),
}));

export const seedSplits: WorkoutSplit[] = splitsJson.map((item) => ({
  ...item,
  nameKey: catalogKey.split(item.id),
  dayNameKeys: Array.from({ length: item.dayCount }, (_, index) =>
    catalogKey.splitDay(item.id, index),
  ),
}));

export const seedMetricTypes: MetricType[] = metricTypesJson.map((item) => ({
  ...item,
  nameKey: catalogKey.metric(item.id),
}));

export const seedPlates = {
  defaultBarWeightKg: platesJson.defaultBarWeightKg,
  defaultStock: platesJson.defaultStock as PlateStockItem[],
};

export const seedCatalog: SeedCatalog = {
  exercises: seedExercises,
  muscleGroups: seedMuscleGroups,
  equipment: seedEquipment,
  movementPatterns: seedMovementPatterns,
  setTypes: seedSetTypes,
  splits: seedSplits,
  metricTypes: seedMetricTypes,
  plates: seedPlates,
};

/** Referential integrity checks, executed at boot and in tests. */
export function validateSeed(catalog: SeedCatalog = seedCatalog): string[] {
  const problems: string[] = [];
  const muscleIds = new Set(catalog.muscleGroups.map((item) => item.id));
  const equipmentIds = new Set(catalog.equipment.map((item) => item.id));
  const patternIds = new Set(catalog.movementPatterns.map((item) => item.id));
  const exerciseIds = new Set<string>();

  for (const exercise of catalog.exercises) {
    if (exerciseIds.has(exercise.id)) problems.push(`duplicate exercise: ${exercise.id}`);
    exerciseIds.add(exercise.id);
    if (!muscleIds.has(exercise.muscleGroupId)) {
      problems.push(`exercise ${exercise.id} has unknown muscle ${exercise.muscleGroupId}`);
    }
    for (const secondary of exercise.secondaryMuscleIds) {
      if (!muscleIds.has(secondary)) {
        problems.push(`exercise ${exercise.id} has unknown secondary muscle ${secondary}`);
      }
    }
    if (!equipmentIds.has(exercise.equipmentId)) {
      problems.push(`exercise ${exercise.id} has unknown equipment ${exercise.equipmentId}`);
    }
    if (!patternIds.has(exercise.movementPatternId)) {
      problems.push(`exercise ${exercise.id} has unknown pattern ${exercise.movementPatternId}`);
    }
    if (exercise.defaultRestSec <= 0) problems.push(`exercise ${exercise.id} has invalid rest`);
    if (exercise.incrementKg <= 0) problems.push(`exercise ${exercise.id} has invalid increment`);
  }

  for (const setType of catalog.setTypes) {
    if (!setType.nameKey.startsWith('setTypes.')) {
      problems.push(`set type ${setType.id} has a non-derived nameKey`);
    }
  }

  if (catalog.splits.some((split) => split.dayNameKeys.length !== split.dayCount)) {
    problems.push('split day labels do not match dayCount');
  }
  if (catalog.metricTypes.length === 0) problems.push('no metric types in seed');

  return problems;
}

/** Every i18n key the seed depends on (verified by the seed test). */
export function seedTextKeys(catalog: SeedCatalog = seedCatalog): string[] {
  return [
    ...catalog.exercises.map((item) => item.nameKey),
    ...catalog.muscleGroups.map((item) => item.nameKey),
    ...catalog.equipment.map((item) => item.nameKey),
    ...catalog.movementPatterns.map((item) => item.nameKey),
    ...catalog.setTypes.map((item) => item.nameKey),
    ...catalog.metricTypes.map((item) => item.nameKey),
    ...catalog.splits.flatMap((split) => [split.nameKey, ...split.dayNameKeys]),
  ];
}

export function defaultRestForExercise(
  exercise: Exercise,
  restByMuscle: Record<string, number>,
  fallbackSec: number = APP_CONFIG.defaults.restDefaultSec,
): number {
  return restByMuscle[exercise.muscleGroupId] ?? exercise.defaultRestSec ?? fallbackSec;
}
