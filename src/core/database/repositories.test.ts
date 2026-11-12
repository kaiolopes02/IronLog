import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IronLogDb } from '@/core/database/db';
import { createRepositories, seedDatabase } from '@/core/database/repositories';
import type { Repositories } from '@/domain/ports/repositories';
import type { WorkoutSession } from '@/domain/entities';
import { makeSet } from '../../../tests/factories';

let db: IronLogDb;
let repos: Repositories;

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'ses-1',
    routineId: null,
    dayId: null,
    name: 'Treino',
    exerciseIds: ['bb-bench'],
    startedAt: 1_000,
    finishedAt: null,
    status: 'active',
    timer: null,
    updatedAt: 1_000,
    noteRef: null,
    ...overrides,
  };
}

beforeEach(async () => {
  db = new IronLogDb(`ironlog-test-${Math.random().toString(36).slice(2)}`);
  await seedDatabase(db);
  repos = createRepositories(db);
});

afterEach(async () => {
  await db.delete();
});

describe('repositories', () => {
  it('seeds the catalog idempotently', async () => {
    const first = await repos.exercises.all();
    await seedDatabase(db);
    const second = await repos.exercises.all();
    expect(first.length).toBeGreaterThan(0);
    expect(second).toHaveLength(first.length);
  });

  it('returns muscle groups sorted by sort order', async () => {
    const groups = await repos.catalog.muscleGroups();
    expect(groups.map((group) => group.sort)).toEqual(
      [...groups.map((group) => group.sort)].sort((a, b) => a - b),
    );
  });

  it('persists settings patches', async () => {
    const initial = await repos.settings.get();
    expect(initial.consentVersion).toBeNull();
    const next = await repos.settings.patch({ unit: 'lb', restDefaultSec: 120 });
    expect(next.unit).toBe('lb');
    expect((await repos.settings.get()).restDefaultSec).toBe(120);
  });

  it('defaults to pt-BR, migrates an older English install once, then respects the choice', async () => {
    const stored = await repos.settings.get();
    expect(stored.locale).toBe('pt-BR');

    await db.meta.delete('localeDefault');
    await db.settings.put({ key: 'app', value: { ...stored, locale: 'en' } });
    await seedDatabase(db);
    expect((await repos.settings.get()).locale).toBe('pt-BR');

    await repos.settings.patch({ locale: 'en' });
    await seedDatabase(db);
    expect((await repos.settings.get()).locale).toBe('en');
  });

  it('finds the newest active session', async () => {
    await repos.sessions.put(session({ id: 'old', startedAt: 1_000 }));
    await repos.sessions.put(session({ id: 'new', startedAt: 5_000 }));
    await repos.sessions.put(
      session({ id: 'done', startedAt: 9_000, status: 'completed', finishedAt: 9_500 }),
    );
    expect((await repos.sessions.findActive())?.id).toBe('new');
  });

  it('lists completed sessions newest first', async () => {
    await repos.sessions.put(
      session({ id: 'a', status: 'completed', startedAt: 1_000, finishedAt: 2_000 }),
    );
    await repos.sessions.put(
      session({ id: 'b', status: 'completed', startedAt: 3_000, finishedAt: 4_000 }),
    );
    await repos.sessions.put(session({ id: 'active', startedAt: 5_000 }));
    const recent = await repos.sessions.recent(10);
    expect(recent.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('returns the last completed sets for an exercise, skipping pending ones', async () => {
    await repos.sets.putMany([
      makeSet({ id: 's1', completedAt: 1_000 }),
      makeSet({ id: 's2', completedAt: 2_000 }),
      makeSet({ id: 's3', completedAt: 3_000, completed: false }),
    ]);
    const last = await repos.sets.lastForExercise('bb-bench', 10_000, 2);
    expect(last.map((set) => set.id)).toEqual(['s2', 's1']);
  });

  it('orders session sets by order index', async () => {
    await repos.sets.putMany([
      makeSet({ id: 's2', order: 2 }),
      makeSet({ id: 's1', order: 1 }),
    ]);
    const sets = await repos.sets.bySession('session-1');
    expect(sets.map((set) => set.id)).toEqual(['s1', 's2']);
  });

  it('removes sessions and sets by id', async () => {
    await repos.sessions.put(session());
    await repos.sets.putMany([makeSet({ id: 'set-remove' })]);
    await repos.sets.remove('set-remove');
    await repos.sessions.remove('ses-1');
    expect(await repos.sessions.get('ses-1')).toBeUndefined();
    expect(await repos.sets.bySession('session-1')).toEqual([]);
  });

  it('stores and clears the security record', async () => {
    const record = {
      version: 1,
      kdf: { iterations: 1000, salt: 'c2FsdA==' },
      wrappedDek: { iv: 'aXY=', data: 'ZGF0YQ==' },
    };
    await repos.security.put(record);
    expect(await repos.security.get()).toEqual(record);
    await repos.security.clear();
    expect(await repos.security.get()).toBeUndefined();
  });
});
