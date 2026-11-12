import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { navigate, useRoute } from '@/app/router';
import { useI18n } from '@/core/i18n';
import type { Routine, RoutineDay } from '@/domain/entities';
import { ExercisePicker } from '@/features/workouts/ExercisePicker';
import { useLiveQuery } from '@/shared/hooks/useLiveQuery';
import { Badge, Button, Card, Field, Header, IconButton, Select, TextInput } from '@/shared/components/ui';
import { IconTrash } from '@/shared/components/icons';
import { newId } from '@/shared/utils/id';
import { exerciseLabel } from '@/shared/utils/labels';
import { toast } from '@/shared/components/Toast';

interface Draft {
  name: string;
  splitId: string;
  days: RoutineDay[];
}

export function RoutineEditorScreen() {
  const { services } = useApp();
  const { t } = useI18n();
  const route = useRoute();
  const id = route.segments[2];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pickerDay, setPickerDay] = useState<string | null>(null);

  const splits = useLiveQuery(() => services.repos.catalog.splits(), [services.repos], []);
  const exercises = useLiveQuery(() => services.repos.exercises.all(), [services.repos], []);
  const existing = useLiveQuery(
    () => (id ? services.repos.routines.get(id) : Promise.resolve(undefined)),
    [services.repos, id],
  );

  useEffect(() => {
    if (draft) return;
    if (id && existing === undefined) return;
    if (id && existing) {
      setDraft({ name: existing.name, splitId: existing.splitId, days: existing.days });
      return;
    }
    if (!id && splits.length > 0) {
      setDraft(buildDraftFromSplit(splits[0].id, splits[0].dayCount, t('routines.defaultName')));
    }
  }, [draft, existing, id, splits, t]);

  const exerciseById = useMemo(
    () => new Map((exercises ?? []).map((exercise) => [exercise.id, exercise])),
    [exercises],
  );

  const changeSplit = (splitId: string) => {
    const split = (splits ?? []).find((item) => item.id === splitId);
    if (!split || !draft) return;
    setDraft({ ...draft, splitId, days: buildDraftFromSplit(splitId, split.dayCount, draft.name).days });
  };

  const save = async () => {
    if (!draft) return;
    const now = Date.now();
    const routine: Routine = {
      id: id ?? newId('rt'),
      name: draft.name.trim() || t('routines.defaultName'),
      splitId: draft.splitId,
      days: draft.days,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await services.repos.routines.put(routine);
    toast(t('common.save'));
    navigate('/workouts');
  };

  if (!draft) {
    return <p class="p-4 text-sm text-muted">{t('common.loading')}</p>;
  }

  return (
    <div class="space-y-4 pb-8">
      <Header title={id ? t('common.edit') : t('routines.new')} subtitle={t('routines.title')} />

      <div class="space-y-3 px-4">
        <Field label={t('routines.name')}>
          <TextInput
            value={draft.name}
            onInput={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
            placeholder={t('routines.defaultName')}
          />
        </Field>

        <Field label={t('routines.split')}>
          <Select
            value={draft.splitId}
            onChange={(event) => changeSplit(event.currentTarget.value)}
          >
            {(splits ?? []).map((split) => (
              <option key={split.id} value={split.id}>
                {t(split.nameKey)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div class="space-y-3 px-4">
        {draft.days.map((day, dayIndex) => (
          <Card key={day.id} class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="truncate text-sm font-semibold text-ink">
                {day.nameKey ? t(day.nameKey) : `${t('routines.day')} ${dayIndex + 1}`}
              </p>
              <div class="flex items-center gap-1">
                <Badge>{day.exerciseIds.length}</Badge>
                <IconButton
                  label={t('routines.removeDay')}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      days: draft.days.filter((item) => item.id !== day.id),
                    })
                  }
                >
                  <IconTrash size={18} />
                </IconButton>
              </div>
            </div>

            <div class="space-y-1">
              {day.exerciseIds.length === 0 ? (
                <p class="text-xs text-muted">{t('routines.emptyDay')}</p>
              ) : (
                day.exerciseIds.map((exerciseId) => (
                  <div
                    key={exerciseId}
                    class="flex items-center justify-between gap-2 border-b border-line py-1.5"
                  >
                    <span class="truncate text-sm text-ink">
                      {exerciseLabel(t, exerciseById.get(exerciseId))}
                    </span>
                    <IconButton
                      label={t('common.remove')}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          days: draft.days.map((item) =>
                            item.id === day.id
                              ? {
                                  ...item,
                                  exerciseIds: item.exerciseIds.filter((value) => value !== exerciseId),
                                }
                              : item,
                          ),
                        })
                      }
                    >
                      <IconTrash size={16} />
                    </IconButton>
                  </div>
                ))
              )}
            </div>

            <Button block variant="outline" onClick={() => setPickerDay(day.id)}>
              + {t('routines.addExercise')}
            </Button>
          </Card>
        ))}

        <Button
          block
          variant="subtle"
          onClick={() =>
            setDraft({
              ...draft,
              days: [
                ...draft.days,
                { id: newId('day'), name: '', nameKey: undefined, exerciseIds: [] },
              ],
            })
          }
        >
          + {t('routines.addDay')}
        </Button>
      </div>

      <div class="px-4">
        <Button block size="lg" onClick={() => void save()}>
          {t('routines.save')}
        </Button>
      </div>

      <ExercisePicker
        open={pickerDay !== null}
        onClose={() => setPickerDay(null)}
        title={t('routines.addExercise')}
        onSelect={(exercise) => {
          if (!pickerDay) return;
          setDraft({
            ...draft,
            days: draft.days.map((day) =>
              day.id === pickerDay && !day.exerciseIds.includes(exercise.id)
                ? { ...day, exerciseIds: [...day.exerciseIds, exercise.id] }
                : day,
            ),
          });
        }}
      />
    </div>
  );
}

function buildDraftFromSplit(splitId: string, dayCount: number, name: string): Draft {
  return {
    name,
    splitId,
    days: Array.from({ length: dayCount }, (_, index) => ({
      id: newId('day'),
      name: '',
      nameKey: `splits.${splitId}.day${index + 1}`,
      exerciseIds: [],
    })),
  };
}
