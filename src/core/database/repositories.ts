import Dexie from 'dexie';
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
import type {
  CatalogRepository,
  ExerciseRepository,
  MetricRepository,
  Repositories,
  RoutineRepository,
  SecurityRepository,
  SessionRepository,
  SetRepository,
  SettingsRepository,
  VaultRepository,
} from '@/domain/ports/repositories';
import { seedCatalog, seedPlates } from '@/seed';
import type { IronLogDb } from '@/core/database/db';

export function defaultSettings(): AppSettings {
  return {
    consentVersion: null,
    locale: APP_CONFIG.defaults.locale,
    unit: APP_CONFIG.defaults.unit,
    weekStartsOn: APP_CONFIG.defaults.weekStartsOn,
    restDefaultSec: APP_CONFIG.defaults.restDefaultSec,
    restByMuscle: Object.fromEntries(
      seedCatalog.muscleGroups.map((group) => [group.id, group.defaultRestSec]),
    ),
    plateStock: seedPlates.defaultStock.map((item) => ({ ...item })),
    barWeightKg: seedPlates.defaultBarWeightKg,
    securityEnabled: false,
    timerSound: true,
    timerVibration: true,
    timerNotifications: false,
    formulaId: APP_CONFIG.defaults.formulaId,
  };
}

/** Idempotent first-run seed: catalogs are data, custom rows are never touched. */
export async function seedDatabase(db: IronLogDb): Promise<void> {
  const stored = await db.meta.get('seedVersion');
  if (stored?.value !== String(APP_CONFIG.seedVersion)) {
    await db.transaction(
      'rw',
      [
        db.meta,
        db.exercises,
        db.muscleGroups,
        db.equipment,
        db.movementPatterns,
        db.setTypes,
        db.splits,
        db.metricTypes,
      ],
      async () => {
        await db.muscleGroups.bulkPut(seedCatalog.muscleGroups);
        await db.equipment.bulkPut(seedCatalog.equipment);
        await db.movementPatterns.bulkPut(seedCatalog.movementPatterns);
        await db.setTypes.bulkPut(seedCatalog.setTypes);
        await db.splits.bulkPut(seedCatalog.splits);
        await db.metricTypes.bulkPut(seedCatalog.metricTypes);
        await db.exercises.bulkPut(seedCatalog.exercises);
        await db.meta.put({ key: 'seedVersion', value: String(APP_CONFIG.seedVersion) });
      },
    );
  }

  const settings = await db.settings.get('app');
  if (!settings) {
    await db.settings.put({ key: 'app', value: defaultSettings() });
  }

  // One-off: pt-BR became the default. Runs once; Ajustes can change it later.
  if (!(await db.meta.get('localeDefault'))) {
    const stored = await db.settings.get('app');
    if (stored) {
      await db.settings.put({ key: 'app', value: { ...stored.value, locale: 'pt-BR' } });
    }
    await db.meta.put({ key: 'localeDefault', value: 'pt-BR' });
  }
}

export class CatalogRepositoryDexie implements CatalogRepository {
  constructor(private readonly db: IronLogDb) {}
  async muscleGroups(): Promise<MuscleGroup[]> {
    const rows = await this.db.muscleGroups.toArray();
    return rows.sort((a, b) => a.sort - b.sort);
  }
  equipment(): Promise<Equipment[]> {
    return this.db.equipment.toArray();
  }
  patterns(): Promise<MovementPattern[]> {
    return this.db.movementPatterns.toArray();
  }
  setTypes(): Promise<SetType[]> {
    return this.db.setTypes.toArray();
  }
  splits(): Promise<WorkoutSplit[]> {
    return this.db.splits.toArray();
  }
  metricTypes(): Promise<MetricType[]> {
    return this.db.metricTypes.toArray();
  }
}

export class ExerciseRepositoryDexie implements ExerciseRepository {
  constructor(private readonly db: IronLogDb) {}
  all(): Promise<Exercise[]> {
    return this.db.exercises.toArray();
  }
  get(id: string): Promise<Exercise | undefined> {
    return this.db.exercises.get(id);
  }
  async putMany(items: Exercise[]): Promise<void> {
    await this.db.exercises.bulkPut(items);
  }
}

export class RoutineRepositoryDexie implements RoutineRepository {
  constructor(private readonly db: IronLogDb) {}
  async all(): Promise<Routine[]> {
    const routines = await this.db.routines.toArray();
    return routines.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  get(id: string): Promise<Routine | undefined> {
    return this.db.routines.get(id);
  }
  async put(routine: Routine): Promise<void> {
    await this.db.routines.put(routine);
  }
  async remove(id: string): Promise<void> {
    await this.db.routines.delete(id);
  }
}

export class SessionRepositoryDexie implements SessionRepository {
  constructor(private readonly db: IronLogDb) {}
  get(id: string): Promise<WorkoutSession | undefined> {
    return this.db.sessions.get(id);
  }
  findActive(): Promise<WorkoutSession | undefined> {
    return this.db.sessions
      .where('[status+startedAt]')
      .between(['active', Dexie.minKey], ['active', Dexie.maxKey])
      .reverse()
      .first();
  }
  async recent(limit: number): Promise<WorkoutSession[]> {
    const sessions = await this.db.sessions.where('status').equals('completed').toArray();
    return sessions.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
  }
  async put(session: WorkoutSession): Promise<void> {
    await this.db.sessions.put(session);
  }
  async remove(id: string): Promise<void> {
    await this.db.sessions.delete(id);
  }
}

export class SetRepositoryDexie implements SetRepository {
  constructor(private readonly db: IronLogDb) {}
  bySession(sessionId: string): Promise<WorkoutSet[]> {
    return this.db.sets
      .where('[sessionId+order]')
      .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
      .toArray();
  }
  async byExercise(exerciseId: string): Promise<WorkoutSet[]> {
    const sets = await this.db.sets.where('exerciseId').equals(exerciseId).toArray();
    return sets.sort((a, b) => a.completedAt - b.completedAt);
  }
  async lastForExercise(exerciseId: string, before: number, limit: number): Promise<WorkoutSet[]> {
    const rows = await this.db.sets
      .where('[exerciseId+completedAt]')
      .between([exerciseId, Dexie.minKey], [exerciseId, before])
      .reverse()
      .limit(limit * 4)
      .toArray();
    return rows.filter((set) => set.completed).slice(0, limit);
  }
  allSince(since: number): Promise<WorkoutSet[]> {
    return this.db.sets.where('completedAt').aboveOrEqual(since).toArray();
  }
  async putMany(sets: WorkoutSet[]): Promise<void> {
    await this.db.sets.bulkPut(sets);
  }
  async remove(id: string): Promise<void> {
    await this.db.sets.delete(id);
  }
}

export class MetricRepositoryDexie implements MetricRepository {
  constructor(private readonly db: IronLogDb) {}
  async all(): Promise<BodyMetric[]> {
    const metrics = await this.db.bodyMetrics.toArray();
    return metrics.sort((a, b) => b.recordedAt - a.recordedAt);
  }
  async put(metric: BodyMetric): Promise<void> {
    await this.db.bodyMetrics.put(metric);
  }
  async remove(id: string): Promise<void> {
    await this.db.bodyMetrics.delete(id);
  }
}

export class SettingsRepositoryDexie implements SettingsRepository {
  constructor(private readonly db: IronLogDb) {}
  async get(): Promise<AppSettings> {
    const row = await this.db.settings.get('app');
    return { ...defaultSettings(), ...(row?.value ?? {}) };
  }
  async patch(partial: Partial<AppSettings>): Promise<AppSettings> {
    const next = { ...(await this.get()), ...partial };
    await this.db.settings.put({ key: 'app', value: next });
    return next;
  }
}

export class VaultRepositoryDexie implements VaultRepository {
  constructor(private readonly db: IronLogDb) {}
  get(id: string): Promise<VaultRecord | undefined> {
    return this.db.vault.get(id);
  }
  async put(record: VaultRecord): Promise<void> {
    await this.db.vault.put(record);
  }
  async remove(id: string): Promise<void> {
    await this.db.vault.delete(id);
  }
  all(): Promise<VaultRecord[]> {
    return this.db.vault.toArray();
  }
}

export class SecurityRepositoryDexie implements SecurityRepository {
  constructor(private readonly db: IronLogDb) {}
  async get(): Promise<SecurityRecord | undefined> {
    const row = await this.db.security.get('main');
    return row?.record;
  }
  async put(record: SecurityRecord): Promise<void> {
    await this.db.security.put({ key: 'main', record });
  }
  async clear(): Promise<void> {
    await this.db.security.delete('main');
  }
}

export function createRepositories(db: IronLogDb): Repositories {
  return {
    catalog: new CatalogRepositoryDexie(db),
    exercises: new ExerciseRepositoryDexie(db),
    routines: new RoutineRepositoryDexie(db),
    sessions: new SessionRepositoryDexie(db),
    sets: new SetRepositoryDexie(db),
    metrics: new MetricRepositoryDexie(db),
    settings: new SettingsRepositoryDexie(db),
    vault: new VaultRepositoryDexie(db),
    security: new SecurityRepositoryDexie(db),
  };
}
