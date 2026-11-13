import { APP_CONFIG } from '@/core/config/app.config';
import type {
  AppSettings,
  Exercise,
  WorkoutSession,
  WorkoutSet,
} from '@/domain/entities';
import type { Repositories } from '@/domain/ports/repositories';
import { resolveRestSeconds } from '@/features/workouts/rest';
import { shiftTimer, startTimer } from '@/domain/services/rest-timer';
import { newId } from '@/shared/utils/id';
import { convert } from '@/shared/utils/units';

export interface StartSessionOptions {
  name: string;
  routineId?: string | null;
  dayId?: string | null;
  exerciseIds?: string[];
}

export async function startSession(
  repos: Repositories,
  options: StartSessionOptions,
): Promise<WorkoutSession> {
  const existing = await repos.sessions.findActive();
  if (existing) return existing;

  const now = Date.now();
  const session: WorkoutSession = {
    id: newId('ses'),
    routineId: options.routineId ?? null,
    dayId: options.dayId ?? null,
    name: options.name,
    exerciseIds: options.exerciseIds ?? [],
    startedAt: now,
    finishedAt: null,
    status: 'active',
    timer: null,
    updatedAt: now,
    noteRef: null,
  };
  await repos.sessions.put(session);
  return session;
}

async function persistSession(
  repos: Repositories,
  session: WorkoutSession,
  patch: Partial<WorkoutSession>,
): Promise<WorkoutSession> {
  const next: WorkoutSession = { ...session, ...patch, updatedAt: Date.now() };
  await repos.sessions.put(next);
  return next;
}

export function addExercise(
  repos: Repositories,
  session: WorkoutSession,
  exerciseId: string,
): Promise<WorkoutSession> {
  if (session.exerciseIds.includes(exerciseId)) return Promise.resolve(session);
  return persistSession(repos, session, { exerciseIds: [...session.exerciseIds, exerciseId] });
}

export async function removeExercise(
  repos: Repositories,
  session: WorkoutSession,
  exerciseId: string,
): Promise<WorkoutSession> {
  const sets = await repos.sets.bySession(session.id);
  await Promise.all(
    sets.filter((set) => set.exerciseId === exerciseId).map((set) => repos.sets.remove(set.id)),
  );
  return persistSession(repos, session, {
    exerciseIds: session.exerciseIds.filter((id) => id !== exerciseId),
  });
}

export function incrementFor(exercise: Exercise, unit: 'kg' | 'lb'): number {
  const kg = exercise.incrementKg || APP_CONFIG.loadStep.kg;
  const converted = convert(kg, 'kg', unit);
  return Math.max(unit === 'kg' ? 0.5 : 1, Math.round(converted * 2) / 2);
}

export async function createSet(
  repos: Repositories,
  session: WorkoutSession,
  exercise: Exercise,
  settings: AppSettings,
  setTypeId: string = APP_CONFIG.workout.defaultSetTypeId,
): Promise<WorkoutSet> {
  const [sessionSets, previous] = await Promise.all([
    repos.sets.bySession(session.id),
    repos.sets.lastForExercise(exercise.id, session.startedAt, 1),
  ]);

  const lastInSession = sessionSets
    .filter((set) => set.exerciseId === exercise.id)
    .sort((a, b) => b.order - a.order || b.completedAt - a.completedAt)[0];
  const source = lastInSession ?? previous[0];
  const unit = settings.unit;
  const weight = source ? Math.round(convert(source.weight, source.unit, unit) * 4) / 4 : 0;
  const reps = source?.reps ?? 8;
  const order = sessionSets.reduce((max, set) => Math.max(max, set.order), 0) + 1;

  const set: WorkoutSet = {
    id: newId('set'),
    sessionId: session.id,
    exerciseId: exercise.id,
    order,
    setTypeId,
    weight,
    unit,
    reps,
    rpe: null,
    rir: null,
    completed: false,
    completedAt: Date.now(),
  };
  await repos.sets.putMany([set]);
  return set;
}

const setWrites = new Map<string, Promise<void>>();

/**
 * Serialized read-modify-write per set id, so two fields edited together
 * (weight + reps) can't overwrite each other with a stale snapshot.
 */
export function patchSet(
  repos: Repositories,
  id: string,
  patch: Partial<WorkoutSet>,
): Promise<void> {
  const previous = setWrites.get(id) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const current = await repos.sets.get(id);
      if (current) await repos.sets.putMany([{ ...current, ...patch }]);
    });
  setWrites.set(id, next);
  const cleanup = () => {
    if (setWrites.get(id) === next) setWrites.delete(id);
  };
  void next.then(cleanup, cleanup);
  return next;
}

export async function deleteSet(repos: Repositories, id: string): Promise<void> {
  await repos.sets.remove(id);
}

/** Marks the set complete and persists the rest timer in the same cycle. */
export async function completeSet(
  repos: Repositories,
  session: WorkoutSession,
  set: WorkoutSet,
  settings: AppSettings,
): Promise<{ session: WorkoutSession; set: WorkoutSet }> {
  const now = Date.now();
  const nextSet: WorkoutSet = { ...set, completed: true, completedAt: now };
  await repos.sets.putMany([nextSet]);

  const exercises = await repos.exercises.all();
  const exercise = exercises.find((item) => item.id === set.exerciseId);
  const seconds = exercise
    ? resolveRestSeconds(exercise, settings)
    : settings.restDefaultSec;
  const timer = startTimer(now, seconds, set.exerciseId);
  const nextSession = await persistSession(repos, session, { timer });
  return { session: nextSession, set: nextSet };
}

export async function reopenSet(repos: Repositories, set: WorkoutSet): Promise<WorkoutSet> {
  const next = { ...set, completed: false };
  await repos.sets.putMany([next]);
  return next;
}

export async function extendRest(
  repos: Repositories,
  session: WorkoutSession,
  seconds: number,
): Promise<void> {
  if (!session.timer) return;
  const now = Date.now();
  const shifted = shiftTimer(session.timer, seconds, now);
  await persistSession(repos, session, {
    timer: { ...session.timer, ...shifted },
  });
}

export async function skipRest(repos: Repositories, session: WorkoutSession): Promise<void> {
  await persistSession(repos, session, { timer: null });
}

export async function finishSession(
  repos: Repositories,
  session: WorkoutSession,
): Promise<WorkoutSession> {
  return persistSession(repos, session, {
    status: 'completed',
    finishedAt: Date.now(),
    timer: null,
  });
}

export async function discardSession(
  repos: Repositories,
  session: WorkoutSession,
): Promise<void> {
  const sets = await repos.sets.bySession(session.id);
  await Promise.all(sets.map((set) => repos.sets.remove(set.id)));
  await repos.sessions.remove(session.id);
}

export async function setsOfSession(
  repos: Repositories,
  sessionId: string,
): Promise<WorkoutSet[]> {
  return repos.sets.bySession(sessionId);
}
