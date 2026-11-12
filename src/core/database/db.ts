import Dexie, { type Table } from 'dexie';
import { APP_CONFIG } from '@/core/config/app.config';
import type {
  AppSettings,
  BodyMetric,
  Equipment,
  Exercise,
  MetricType,
  MovementPattern,
  MuscleGroup,
  Routine,
  SecurityRecord,
  SetType,
  VaultRecord,
  WorkoutSession,
  WorkoutSet,
  WorkoutSplit,
} from '@/domain/entities';

export interface MetaRow {
  key: string;
  value: string;
}

export interface SettingsRow {
  key: string;
  value: AppSettings;
}

export interface SecurityRow {
  key: 'main';
  record: SecurityRecord;
}

/**
 * Dexie schema. Compound indexes exist for the two hot paths:
 * last performance per exercise and sets of one session.
 */
export class IronLogDb extends Dexie {
  meta!: Table<MetaRow, string>;
  settings!: Table<SettingsRow, string>;
  exercises!: Table<Exercise, string>;
  muscleGroups!: Table<MuscleGroup, string>;
  equipment!: Table<Equipment, string>;
  movementPatterns!: Table<MovementPattern, string>;
  setTypes!: Table<SetType, string>;
  splits!: Table<WorkoutSplit, string>;
  metricTypes!: Table<MetricType, string>;
  routines!: Table<Routine, string>;
  sessions!: Table<WorkoutSession, string>;
  sets!: Table<WorkoutSet, string>;
  bodyMetrics!: Table<BodyMetric, string>;
  vault!: Table<VaultRecord, string>;
  security!: Table<SecurityRow, string>;

  constructor(name: string = APP_CONFIG.dbName) {
    super(name);
    this.version(APP_CONFIG.schemaVersion).stores({
      meta: 'key',
      settings: 'key',
      exercises: 'id, muscleGroupId, equipmentId, movementPatternId, *secondaryMuscleIds',
      muscleGroups: 'id, sort',
      equipment: 'id',
      movementPatterns: 'id',
      setTypes: 'id',
      splits: 'id',
      metricTypes: 'id',
      routines: 'id, updatedAt',
      sessions: 'id, status, startedAt, [status+startedAt], routineId',
      sets: 'id, sessionId, exerciseId, completedAt, [exerciseId+completedAt], [sessionId+order]',
      bodyMetrics: 'id, typeId, recordedAt, [typeId+recordedAt]',
      vault: 'id, updatedAt',
      security: 'key',
    });
  }
}
