import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG } from '@/core/config/app.config';
import { IronLogDb } from '@/core/database/db';
import { createRepositories, seedDatabase } from '@/core/database/repositories';
import type { AppSettings, Exercise, WorkoutSession } from '@/domain/entities';
import type { Repositories } from '@/domain/ports/repositories';
import { createSet, patchSet } from '@/features/workouts/session-actions';
import { makeSet } from '../../../tests/factories';

let db: IronLogDb;
let repos: Repositories;
let settings: AppSettings;
let exercise: Exercise;
let session: WorkoutSession;

beforeEach(async () => {
  db = new IronLogDb(`ironlog-session-${Math.random().toString(36).slice(2)}`);
  await seedDatabase(db);
  repos = createRepositories(db);
  settings = await repos.settings.get();
  const found = await repos.exercises.get('bb-bench');
  if (!found) throw new Error('seed catalog missing bb-bench');
  exercise = found;
  session = {
    id: 'ses-copy',
    routineId: null,
    dayId: null,
    name: 'Treino',
    exerciseIds: [exercise.id],
    startedAt: 10_000,
    finishedAt: null,
    status: 'active',
    timer: null,
    updatedAt: 10_000,
    noteRef: null,
  };
  await repos.sessions.put(session);
});

afterEach(async () => {
  await db.delete();
});

describe('createSet', () => {
  it('starts from empty values when there is no source set', async () => {
    const set = await createSet(repos, session, exercise, settings);
    expect(set.weight).toBe(0);
    expect(set.reps).toBe(8);
  });

  it('copies weight and reps from the last set of the session', async () => {
    const first = await createSet(repos, session, exercise, settings);
    await patchSet(repos, first.id, { weight: 100, reps: 12 });

    const second = await createSet(repos, session, exercise, settings);
    expect(second.weight).toBe(100);
    expect(second.reps).toBe(12);
  });

  it('always copies the most recent edit and keeps order increasing', async () => {
    const first = await createSet(repos, session, exercise, settings);
    await patchSet(repos, first.id, { weight: 100, reps: 12 });
    const second = await createSet(repos, session, exercise, settings);

    await patchSet(repos, second.id, { weight: 102.5, reps: 10 });
    const third = await createSet(repos, session, exercise, settings);

    expect(third.weight).toBe(102.5);
    expect(third.reps).toBe(10);
    expect(third.order).toBeGreaterThan(second.order);
    expect(second.order).toBeGreaterThan(first.order);
  });

  it('persists two patches fired together without clobbering a field', async () => {
    const first = await createSet(repos, session, exercise, settings);
    await Promise.all([
      patchSet(repos, first.id, { weight: 120 }),
      patchSet(repos, first.id, { reps: 6 }),
    ]);

    const next = await createSet(repos, session, exercise, settings);
    expect(next.weight).toBe(120);
    expect(next.reps).toBe(6);
  });

  it('falls back to the last completed set before the session started', async () => {
    await repos.sets.putMany([
      makeSet({ exerciseId: exercise.id, weight: 60, reps: 5, completedAt: 9_000 }),
    ]);

    const set = await createSet(repos, session, exercise, settings);
    expect(set.weight).toBe(60);
    expect(set.reps).toBe(5);
  });

  it('converts the previous load into the configured unit', async () => {
    settings = await repos.settings.patch({ unit: 'lb' });
    await repos.sets.putMany([
      makeSet({
        exerciseId: exercise.id,
        weight: 100,
        unit: 'kg',
        reps: 5,
        completedAt: 9_000,
      }),
    ]);

    const set = await createSet(repos, session, exercise, settings);
    expect(set.unit).toBe('lb');
    expect(set.weight).toBe(220.5);
  });

  it('uses the configured default set type', async () => {
    const set = await createSet(repos, session, exercise, settings);
    expect(set.setTypeId).toBe(APP_CONFIG.workout.defaultSetTypeId);
  });
});
