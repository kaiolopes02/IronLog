import { useMemo, useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { APP_CONFIG } from '@/core/config/app.config';
import { useI18n } from '@/core/i18n';
import { primeAudio } from '@/core/platform/notifier';
import { detectPersonalRecords } from '@/domain/services/records';
import type { Exercise, SetType, WorkoutSession, WorkoutSet } from '@/domain/entities';
import {
  addExercise,
  completeSet,
  createSet,
  deleteSet,
  discardSession,
  finishSession,
  incrementFor,
  removeExercise,
  reopenSet,
  updateSet,
} from '@/features/workouts/session-actions';
import { ExercisePicker } from '@/features/workouts/ExercisePicker';
import { PlateSheet } from '@/features/workouts/PlateSheet';
import { RestTimerBar } from '@/features/workouts/RestTimerBar';
import { useLiveQuery } from '@/shared/hooks/useLiveQuery';
import { useNow } from '@/shared/hooks/useNow';
import { useWakeLock } from '@/shared/hooks/useWakeLock';
import { Badge, Button, Card, EmptyState, Header, IconButton } from '@/shared/components/ui';
import { IconPlate, IconPlay, IconTrash } from '@/shared/components/icons';
import { Stepper } from '@/shared/components/Stepper';
import { toast } from '@/shared/components/Toast';
import { formatClock, formatDate } from '@/shared/utils/date';
import { exerciseLabel } from '@/shared/utils/labels';
import { fromKg } from '@/shared/utils/units';
import { navigate } from '@/app/router';

function SetRow({
  set,
  setTypes,
  increment,
  onChange,
  onToggle,
  onDelete,
}: {
  set: WorkoutSet;
  setTypes: SetType[];
  increment: number;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const type = setTypes.find((item) => item.id === set.setTypeId);
  const typeIndex = Math.max(0, setTypes.findIndex((item) => item.id === set.setTypeId));

  return (
    <div
      class={`rounded-lg border p-2 ${
        set.completed ? 'border-success/40 bg-success/5' : 'border-line bg-raised'
      }`}
    >
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            const next = setTypes[(typeIndex + 1) % setTypes.length];
            if (next) onChange({ setTypeId: next.id });
          }}
          class="min-h-touch rounded-md border border-line px-2 text-[11px] font-medium text-ink active:bg-line"
        >
          {type ? t(type.nameKey) : set.setTypeId}
        </button>

        <label class="flex min-h-touch items-center gap-1 rounded-md border border-line px-2 text-[11px] text-muted">
          RPE
          <select
            aria-label={t('common.rpe')}
            value={set.rpe === null ? '' : String(set.rpe)}
            onChange={(event) =>
              onChange({ rpe: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })
            }
            class="bg-transparent text-xs text-ink focus:outline-none"
          >
            <option value="">—</option>
            {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <div class="ml-auto flex items-center">
          <IconButton label={t('common.delete')} onClick={onDelete}>
            <IconTrash size={18} />
          </IconButton>
          <button
            type="button"
            aria-label={t('workout.completeSet')}
            aria-pressed={set.completed}
            onClick={onToggle}
            class={`flex min-h-touch min-w-touch items-center justify-center rounded-lg border text-lg font-bold ${
              set.completed
                ? 'border-success bg-success text-black'
                : 'border-primary text-primary active:bg-primary/20'
            }`}
          >
            ✓
          </button>
        </div>
      </div>

      <div class="mt-2 grid grid-cols-2 gap-2">
        <Stepper
          label={t('common.weight')}
          value={set.weight}
          step={increment}
          min={0}
          onChange={(weight) => {
            if (weight !== set.weight) onChange({ weight });
          }}
          suffix={set.unit}
          compact
        />
        <Stepper
          label={t('common.reps')}
          value={set.reps}
          step={1}
          min={1}
          max={APP_CONFIG.reps.max}
          onChange={(reps) => {
            if (reps !== set.reps) onChange({ reps });
          }}
          suffix={t('common.reps')}
          compact
        />
      </div>
    </div>
  );
}

function ExerciseBlock({
  session,
  exercise,
  sets,
  setTypes,
  onRemoved,
}: {
  session: WorkoutSession;
  exercise: Exercise;
  sets: WorkoutSet[];
  setTypes: SetType[];
  onRemoved: () => void;
}) {
  const { services, settings } = useApp();
  const { t } = useI18n();
  const [plateOpen, setPlateOpen] = useState(false);
  const lastSet = sets[sets.length - 1];
  const last = useLiveQuery(
    () => services.repos.sets.lastForExercise(exercise.id, session.startedAt, 1),
    [services.repos, exercise.id, session.startedAt],
    [],
  );
  const previous = last?.[0];

  const add = async () => {
    primeAudio();
    await createSet(services.repos, session, exercise, settings);
  };

  const toggle = async (set: WorkoutSet) => {
    primeAudio();
    if (set.completed) {
      await reopenSet(services.repos, set);
      return;
    }
    await completeSet(services.repos, session, set, settings);
  };

  return (
    <Card class="space-y-2">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-ink">{exerciseLabel(t, exercise)}</p>
          <p class="truncate text-[11px] text-muted">
            {previous
              ? `${t('workout.lastTime')}: ${previous.weight} ${previous.unit} × ${previous.reps}`
              : t('workout.firstTime')}
          </p>
        </div>
        <div class="flex shrink-0 items-center">
          <IconButton label={t('workout.plates')} onClick={() => setPlateOpen(true)}>
            <IconPlate size={20} />
          </IconButton>
          <IconButton
            label={t('common.remove')}
            onClick={async () => {
              if (!window.confirm(t('common.remove'))) return;
              await removeExercise(services.repos, session, exercise.id);
              onRemoved();
            }}
          >
            <IconTrash size={18} />
          </IconButton>
        </div>
      </div>

      <div class="space-y-2">
        {sets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            setTypes={setTypes}
            increment={incrementFor(exercise, set.unit)}
            onChange={(patch) => void updateSet(services.repos, { ...set, ...patch })}
            onToggle={() => void toggle(set)}
            onDelete={() => void deleteSet(services.repos, set.id)}
          />
        ))}
        {sets.length === 0 ? (
          <p class="text-xs text-muted">{t('routines.emptyDay')}</p>
        ) : null}
      </div>

      <Button block variant="outline" onClick={add}>
        + {t('workout.addSet')}
      </Button>

      <PlateSheet
        open={plateOpen}
        onClose={() => setPlateOpen(false)}
        initialWeight={lastSet?.weight ?? 0}
        unit={settings.unit}
      />
    </Card>
  );
}

export function ActiveWorkoutScreen() {
  const { services, settings } = useApp();
  const { t, locale } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);

  const session = useLiveQuery(() => services.repos.sessions.findActive(), [services.repos]);
  const exercises = useLiveQuery(() => services.repos.exercises.all(), [services.repos], []);
  const setTypes = useLiveQuery(() => services.repos.catalog.setTypes(), [services.repos], []);
  const sets = useLiveQuery(
    () => (session ? services.repos.sets.bySession(session.id) : Promise.resolve([])),
    [services.repos, session?.id],
    [],
  );

  useWakeLock(Boolean(session));
  const now = useNow(Boolean(session), 1000);

  const exerciseById = useMemo(
    () => new Map((exercises ?? []).map((exercise) => [exercise.id, exercise])),
    [exercises],
  );

  if (session === undefined) {
    return <p class="p-4 text-sm text-muted">{t('common.loading')}</p>;
  }

  if (!session) {
    return (
      <div class="space-y-4 p-4">
        <Header title={t('workout.active')} />
        <EmptyState
          title={t('common.empty')}
          action={
            <Button onClick={() => navigate('/workouts')}>
              <IconPlay size={16} /> {t('nav.workouts')}
            </Button>
          }
        />
      </div>
    );
  }

  const allSets = sets ?? [];
  const finish = async () => {
    if (!window.confirm(t('workout.finishConfirm'))) return;

    const types = setTypes.reduce<Record<string, SetType>>(
      (index, type) => ({ ...index, [type.id]: type }),
      {},
    );
    const history: WorkoutSet[] = [];
    for (const exerciseId of session.exerciseIds) {
      history.push(...(await services.repos.sets.lastForExercise(exerciseId, session.startedAt, 200)));
    }
    const completed = allSets.filter((set) => set.completed);
    const records = detectPersonalRecords(history, completed, types, settings.formulaId);
    await finishSession(services.repos, session);
    if (records.length > 0) {
      const value = Math.round(fromKg(records[0].value, settings.unit) * 10) / 10;
      toast(`${t('records.newRecord')}: ${value} ${settings.unit}`);
    } else toast(t('common.save'));
    navigate('/workouts');
  };

  const discard = async () => {
    if (!window.confirm(t('workout.discardConfirm'))) return;
    await discardSession(services.repos, session);
    navigate('/');
  };

  const setsByExercise = (exerciseId: string) =>
    allSets.filter((set) => set.exerciseId === exerciseId).sort((a, b) => a.order - b.order);

  return (
    <div class="flex min-h-full flex-col">
      <header class="space-y-2 border-b border-line px-4 py-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[11px] uppercase tracking-wide text-primary">{t('workout.active')}</p>
            <h1 class="truncate text-lg font-bold text-ink">{session.name}</h1>
            <p class="tnum text-xs text-muted">
              {t('workout.elapsed')}: {formatClock(now - session.startedAt)} ·{' '}
              {formatDate(session.startedAt, locale)}
            </p>
          </div>
          <div class="flex shrink-0 gap-1.5">
            <Button variant="danger" onClick={() => void discard()}>
              {t('workout.discard')}
            </Button>
            <Button onClick={() => void finish()}>{t('workout.finish')}</Button>
          </div>
        </div>
      </header>

      <RestTimerBar session={session} />

      <div class="flex-1 space-y-3 px-4 py-3">
        {session.exerciseIds.length === 0 ? (
          <EmptyState title={t('workout.noExercises')} />
        ) : (
          session.exerciseIds.map((exerciseId) => {
            const exercise = exerciseById.get(exerciseId);
            if (!exercise) return null;
            return (
              <ExerciseBlock
                key={exerciseId}
                session={session}
                exercise={exercise}
                sets={setsByExercise(exerciseId)}
                setTypes={setTypes ?? []}
                onRemoved={() => undefined}
              />
            );
          })
        )}

        <Button block variant="outline" onClick={() => setPickerOpen(true)}>
          + {t('workout.addExercise')}
        </Button>

        <div class="flex flex-wrap gap-2 pb-4">
          <Badge>{`${allSets.filter((set) => set.completed).length} ${t('common.sets')}`}</Badge>
          <Badge tone="primary">{session.exerciseIds.length} {t('common.exercises')}</Badge>
        </div>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        excludeIds={session.exerciseIds}
        onSelect={async (exercise) => {
          const next = await addExercise(services.repos, session, exercise.id);
          await createSet(services.repos, next, exercise, settings);
        }}
      />
    </div>
  );
}
