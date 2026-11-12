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

export interface CatalogRepository {
  muscleGroups(): Promise<MuscleGroup[]>;
  equipment(): Promise<Equipment[]>;
  patterns(): Promise<MovementPattern[]>;
  setTypes(): Promise<SetType[]>;
  splits(): Promise<WorkoutSplit[]>;
  metricTypes(): Promise<MetricType[]>;
}

export interface ExerciseRepository {
  all(): Promise<Exercise[]>;
  get(id: string): Promise<Exercise | undefined>;
  putMany(items: Exercise[]): Promise<void>;
}

export interface RoutineRepository {
  all(): Promise<Routine[]>;
  get(id: string): Promise<Routine | undefined>;
  put(routine: Routine): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface SessionRepository {
  get(id: string): Promise<WorkoutSession | undefined>;
  findActive(): Promise<WorkoutSession | undefined>;
  recent(limit: number): Promise<WorkoutSession[]>;
  put(session: WorkoutSession): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface SetRepository {
  bySession(sessionId: string): Promise<WorkoutSet[]>;
  byExercise(exerciseId: string): Promise<WorkoutSet[]>;
  lastForExercise(exerciseId: string, before: number, limit: number): Promise<WorkoutSet[]>;
  allSince(since: number): Promise<WorkoutSet[]>;
  putMany(sets: WorkoutSet[]): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface MetricRepository {
  all(): Promise<BodyMetric[]>;
  put(metric: BodyMetric): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  patch(partial: Partial<AppSettings>): Promise<AppSettings>;
}

export interface VaultRepository {
  get(id: string): Promise<VaultRecord | undefined>;
  put(record: VaultRecord): Promise<void>;
  remove(id: string): Promise<void>;
  all(): Promise<VaultRecord[]>;
}

export interface SecurityRepository {
  get(): Promise<SecurityRecord | undefined>;
  put(record: SecurityRecord): Promise<void>;
  clear(): Promise<void>;
}

export interface Repositories {
  catalog: CatalogRepository;
  exercises: ExerciseRepository;
  routines: RoutineRepository;
  sessions: SessionRepository;
  sets: SetRepository;
  metrics: MetricRepository;
  settings: SettingsRepository;
  vault: VaultRepository;
  security: SecurityRepository;
}
