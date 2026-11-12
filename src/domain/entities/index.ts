/** Domain entities. No framework, storage or UI imports are allowed here. */

export type Id = string;
export type WeightUnit = 'kg' | 'lb';
export type LocaleCode = 'pt-BR' | 'en';
export type SessionStatus = 'active' | 'completed' | 'abandoned';
export type RecordKindId = 'e1rm' | 'weight' | 'volume';

export interface MuscleGroup {
  id: Id;
  nameKey: string;
  sort: number;
  defaultRestSec: number;
}

export interface Equipment {
  id: Id;
  nameKey: string;
}

export interface MovementPattern {
  id: Id;
  nameKey: string;
}

export interface Exercise {
  id: Id;
  nameKey: string;
  /** Only custom exercises carry a free-form name. */
  name?: string;
  muscleGroupId: Id;
  secondaryMuscleIds: Id[];
  equipmentId: Id;
  movementPatternId: Id;
  defaultRestSec: number;
  incrementKg: number;
  isCustom: boolean;
  /** Custom exercises are archived instead of deleted, so logged sets keep their label. */
  archived?: boolean;
}

export interface SetType {
  id: Id;
  nameKey: string;
  isWarmup: boolean;
  countsForVolume: boolean;
  countsForPR: boolean;
}

export interface WorkoutSplit {
  id: Id;
  nameKey: string;
  dayNameKeys: string[];
  dayCount: number;
}

export interface RoutineDay {
  id: Id;
  name: string;
  /** Present for split-generated days, so labels follow the locale. */
  nameKey?: string;
  exerciseIds: Id[];
}

export interface Routine {
  id: Id;
  name: string;
  splitId: Id;
  days: RoutineDay[];
  createdAt: number;
  updatedAt: number;
}

export interface RestTimerState {
  durationSec: number;
  /** Absolute epoch ms; null when the timer is idle. */
  endsAt: number | null;
  exerciseId: Id | null;
}

export interface WorkoutSession {
  id: Id;
  routineId: Id | null;
  dayId: Id | null;
  name: string;
  /** Persisted exercise order, so crash recovery restores the whole session. */
  exerciseIds: Id[];
  startedAt: number;
  finishedAt: number | null;
  status: SessionStatus;
  timer: RestTimerState | null;
  updatedAt: number;
  /** id of the vault record holding the encrypted note, when present. */
  noteRef: Id | null;
}

export interface WorkoutSet {
  id: Id;
  sessionId: Id;
  exerciseId: Id;
  order: number;
  setTypeId: Id;
  weight: number;
  unit: WeightUnit;
  reps: number;
  rpe: number | null;
  rir: number | null;
  /** Pending sets are persisted too, so a crash never loses typed values. */
  completed: boolean;
  completedAt: number;
}

export interface MetricType {
  id: Id;
  nameKey: string;
  unit: string;
}

export interface BodyMetric {
  id: Id;
  typeId: Id;
  value: number;
  recordedAt: number;
  noteRef: Id | null;
}

export interface PlateStockItem {
  id: Id;
  weightKg: number;
  pairs: number;
}

export interface PersonalRecord {
  exerciseId: Id;
  kindId: RecordKindId;
  value: number;
  before: number;
  achievedAt: number;
  setId: Id;
}

/** AES-GCM output: base64 iv + ciphertext. */
export interface KeyEnvelope {
  iv: string;
  data: string;
}

export interface VaultRecord {
  id: Id;
  target: string;
  updatedAt: number;
  payload: KeyEnvelope;
}

export interface KdfParams {
  iterations: number;
  salt: string;
}

export interface SecurityRecord {
  version: number;
  kdf: KdfParams;
  wrappedDek: KeyEnvelope;
}

export interface AppSettings {
  consentVersion: string | null;
  locale: LocaleCode;
  unit: WeightUnit;
  weekStartsOn: 0 | 1;
  restDefaultSec: number;
  restByMuscle: Record<Id, number>;
  plateStock: PlateStockItem[];
  barWeightKg: number;
  securityEnabled: boolean;
  timerSound: boolean;
  timerVibration: boolean;
  timerNotifications: boolean;
  formulaId: string;
}
