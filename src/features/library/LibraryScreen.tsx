import { useMemo, useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { navigate } from '@/app/router';
import { useI18n } from '@/core/i18n';
import { countsForPr } from '@/domain/services/records';
import { estimateOneRepMax } from '@/domain/services/one-rep-max';
import { setTypeIndex } from '@/domain/services/volume';
import type { Exercise } from '@/domain/entities';
import { addExercise, createSet, startSession } from '@/features/workouts/session-actions';
import { ExerciseFormSheet } from '@/features/library/ExerciseFormSheet';
import { useLiveQuery } from '@/shared/hooks/useLiveQuery';
import {
  Badge,
  Button,
  EmptyState,
  Header,
  Sheet,
  TextInput,
} from '@/shared/components/ui';
import { IconPencil, IconPlay, IconPlus, IconTrash } from '@/shared/components/icons';
import { toast } from '@/shared/components/Toast';
import { exerciseLabel } from '@/shared/utils/labels';
import { formatDate } from '@/shared/utils/date';
import { fromKg, toKg } from '@/shared/utils/units';

export function LibraryScreen() {
  const { services, settings } = useApp();
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState('all');
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [form, setForm] = useState<{ exercise: Exercise | null } | null>(null);

  const exercises = useLiveQuery(() => services.repos.exercises.all(), [services.repos], []);
  const muscles = useLiveQuery(() => services.repos.catalog.muscleGroups(), [services.repos], []);
  const setTypes = useLiveQuery(() => services.repos.catalog.setTypes(), [services.repos], []);
  const selectedSets = useLiveQuery(
    () => (selected ? services.repos.sets.byExercise(selected.id) : Promise.resolve([])),
    [services.repos, selected?.id],
    [],
  );

  const typeIndex = useMemo(() => setTypeIndex(setTypes ?? []), [setTypes]);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (exercises ?? [])
        .filter((exercise) => !exercise.archived)
        .filter((exercise) => muscle === 'all' || exercise.muscleGroupId === muscle)
        .filter((exercise) => exerciseLabel(t, exercise).toLowerCase().includes(term))
        .sort((a, b) => exerciseLabel(t, a).localeCompare(exerciseLabel(t, b))),
    [exercises, muscle, term, t],
  );

  const best = useMemo(() => {
    const completed = (selectedSets ?? []).filter(
      (set) => set.completed && countsForPr(set, typeIndex),
    );
    return completed.reduce(
      (max, set) =>
        Math.max(max, estimateOneRepMax(toKg(set.weight, set.unit), set.reps, settings.formulaId)),
      0,
    );
  }, [selectedSets, typeIndex, settings.formulaId]);

  const startWith = async (exercise: Exercise) => {
    const active = await services.repos.sessions.findActive();
    const session =
      active ??
      (await startSession(services.repos, {
        name: t('home.quickStart'),
        exerciseIds: [],
      }));
    const next = await addExercise(services.repos, session, exercise.id);
    await createSet(services.repos, next, exercise, settings);
    setSelected(null);
    navigate('/session');
  };

  const archive = async (exercise: Exercise) => {
    if (!window.confirm(t('library.deleteConfirm'))) return;
    await services.repos.exercises.putMany([{ ...exercise, archived: true }]);
    setSelected(null);
    toast(t('library.deleted'));
  };

  return (
    <div class="pb-6">
      <Header
        title={t('library.title')}
        subtitle={`${filtered.length} ${t('common.exercises')}`}
        action={
          <Button onClick={() => setForm({ exercise: null })}>
            <IconPlus size={16} /> {t('library.addCustom')}
          </Button>
        }
      />

      <div class="space-y-2 px-4 pb-2">
        <TextInput
          type="search"
          inputMode="search"
          value={search}
          placeholder={t('library.search')}
          aria-label={t('library.search')}
          onInput={(event) => setSearch(event.currentTarget.value)}
        />
        <div class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <button
            type="button"
            onClick={() => setMuscle('all')}
            class={`min-h-touch shrink-0 rounded-full border px-3 text-xs font-medium ${
              muscle === 'all' ? 'border-primary text-primary' : 'border-line text-muted'
            }`}
          >
            {t('common.all')}
          </button>
          {(muscles ?? []).map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setMuscle(group.id)}
              class={`min-h-touch shrink-0 rounded-full border px-3 text-xs font-medium ${
                muscle === group.id ? 'border-primary text-primary' : 'border-line text-muted'
              }`}
            >
              {t(group.nameKey)}
            </button>
          ))}
        </div>
      </div>

      <div class="border-t border-line">
        {filtered.length === 0 ? (
          <div class="px-4 py-6">
            <EmptyState title={t('library.noResults')} />
          </div>
        ) : (
          filtered.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => setSelected(exercise)}
              class="flex min-h-16 w-full items-center justify-between gap-3 border-b border-line px-4 py-2 text-left active:bg-surface"
            >
              <span class="flex min-w-0 flex-col">
                <span class="truncate text-sm font-medium text-ink">
                  {exerciseLabel(t, exercise)}
                </span>
                <span class="truncate text-xs text-muted">
                  {t(`muscleGroups.${exercise.muscleGroupId}`)} ·{' '}
                  {t(`equipment.${exercise.equipmentId}`)}
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-1">
                {exercise.isCustom ? <Badge>{t('library.custom')}</Badge> : null}
                <span class="text-muted">›</span>
              </span>
            </button>
          ))
        )}
      </div>

      <Sheet
        open={selected !== null}
        title={selected ? exerciseLabel(t, selected) : ''}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <>
            <div class="flex flex-wrap gap-1.5">
              <Badge tone="primary">{t(`muscleGroups.${selected.muscleGroupId}`)}</Badge>
              <Badge>{t(`equipment.${selected.equipmentId}`)}</Badge>
              <Badge>{t(`patterns.${selected.movementPatternId}`)}</Badge>
            </div>

            <div class="rounded-lg border border-line bg-raised p-3">
              <p class="text-xs uppercase tracking-wide text-muted">{t('library.bestE1rm')}</p>
              <p class="tnum text-xl font-bold text-ink">
                {best > 0
                  ? `${Math.round(fromKg(best, settings.unit) * 10) / 10} ${settings.unit}`
                  : '—'}
              </p>
            </div>

            <div class="space-y-1">
              <p class="text-xs uppercase tracking-wide text-muted">{t('library.recentSets')}</p>
              {(selectedSets ?? []).length === 0 ? (
                <p class="text-xs text-muted">{t('common.empty')}</p>
              ) : (
                (selectedSets ?? [])
                  .filter((set) => set.completed)
                  .slice(-5)
                  .reverse()
                  .map((set) => (
                    <div
                      key={set.id}
                      class="flex items-center justify-between border-b border-line py-1.5 text-sm"
                    >
                      <span class="tnum text-ink">
                        {set.weight} {set.unit} × {set.reps}
                      </span>
                      <span class="text-xs text-muted">{formatDate(set.completedAt, locale)}</span>
                    </div>
                  ))
              )}
            </div>

            <Button block size="lg" onClick={() => void startWith(selected)}>
              <IconPlay size={18} /> {t('library.startWith')}
            </Button>

            <div class="flex gap-2">
              <Button
                block
                variant="outline"
                onClick={() => {
                  setForm({ exercise: selected });
                  setSelected(null);
                }}
              >
                <IconPencil size={16} /> {t('common.edit')}
              </Button>
              {selected.isCustom ? (
                <Button block variant="danger" onClick={() => void archive(selected)}>
                  <IconTrash size={16} /> {t('common.delete')}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </Sheet>

      {form ? (
        <ExerciseFormSheet exercise={form.exercise} onClose={() => setForm(null)} />
      ) : null}
    </div>
  );
}
