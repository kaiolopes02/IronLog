import { useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { useI18n } from '@/core/i18n';
import { ExerciseFormSheet } from '@/features/library/ExerciseFormSheet';
import { useLiveQuery } from '@/shared/hooks/useLiveQuery';
import { Button, EmptyState, Sheet, TextInput } from '@/shared/components/ui';
import { IconPlus } from '@/shared/components/icons';
import { exerciseLabel } from '@/shared/utils/labels';
import type { Exercise } from '@/domain/entities';

export interface ExercisePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  excludeIds?: readonly string[];
  title?: string;
}

export function ExercisePicker({ open, onClose, onSelect, excludeIds = [], title }: ExercisePickerProps) {
  const { services } = useApp();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState('all');
  const [creating, setCreating] = useState(false);

  const exercises = useLiveQuery(() => services.repos.exercises.all(), [services.repos], []);
  const muscles = useLiveQuery(() => services.repos.catalog.muscleGroups(), [services.repos], []);

  const term = search.trim().toLowerCase();
  const filtered = (exercises ?? [])
    .filter((exercise) => !exercise.archived)
    .filter((exercise) => !excludeIds.includes(exercise.id))
    .filter((exercise) => muscle === 'all' || exercise.muscleGroupId === muscle)
    .filter((exercise) => {
      if (!term) return true;
      const label = exerciseLabel(t, exercise).toLowerCase();
      return label.includes(term);
    })
    .sort((a, b) => exerciseLabel(t, a).localeCompare(exerciseLabel(t, b)));

  return (
    <Sheet open={open} title={title ?? t('workout.addExercise')} onClose={onClose}>
      <TextInput
        type="search"
        inputMode="search"
        placeholder={t('library.search')}
        value={search}
        onInput={(event) => setSearch(event.currentTarget.value)}
        aria-label={t('library.search')}
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

      <div class="max-h-[52vh] overflow-y-auto border-t border-line">
        {filtered.length === 0 ? (
          <div class="py-4">
            <EmptyState title={t('library.noResults')} />
          </div>
        ) : (
          filtered.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => {
                onSelect(exercise);
                onClose();
              }}
              class="flex min-h-16 w-full items-center justify-between gap-3 border-b border-line px-1 py-2 text-left active:bg-raised"
            >
              <span class="flex flex-col">
                <span class="text-sm font-medium text-ink">{exerciseLabel(t, exercise)}</span>
                <span class="text-xs text-muted">
                  {t(`muscleGroups.${exercise.muscleGroupId}`)} · {t(`equipment.${exercise.equipmentId}`)}
                </span>
              </span>
              <span class="text-primary">+</span>
            </button>
          ))
        )}
      </div>

      <Button block variant="outline" onClick={() => setCreating(true)}>
        <IconPlus size={16} /> {t('library.createNew')}
      </Button>

      {creating ? (
        <ExerciseFormSheet
          onClose={() => setCreating(false)}
          onSaved={(exercise) => {
            onSelect(exercise);
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}
