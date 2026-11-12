import { useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { APP_CONFIG } from '@/core/config/app.config';
import { useI18n } from '@/core/i18n';
import type { Exercise } from '@/domain/entities';
import { useLiveQuery } from '@/shared/hooks/useLiveQuery';
import { Button, Field, Select, Sheet, TextInput } from '@/shared/components/ui';
import { toast } from '@/shared/components/Toast';
import { exerciseLabel } from '@/shared/utils/labels';
import { newId } from '@/shared/utils/id';

export interface ExerciseFormSheetProps {
  /** Present when editing; absent when creating. */
  exercise?: Exercise | null;
  onClose: () => void;
  onSaved?: (exercise: Exercise) => void;
}

/**
 * One form for creating and editing exercises. Mount it only while open, so the
 * seed defaults are read once from the catalogs.
 */
export function ExerciseFormSheet({ exercise, onClose, onSaved }: ExerciseFormSheetProps) {
  const { services, settings } = useApp();
  const { t } = useI18n();
  const muscles = useLiveQuery(() => services.repos.catalog.muscleGroups(), [services.repos], []);
  const equipment = useLiveQuery(() => services.repos.catalog.equipment(), [services.repos], []);

  const [name, setName] = useState(exercise?.name ?? '');
  const [muscle, setMuscle] = useState(
    exercise?.muscleGroupId ?? muscles[0]?.id ?? 'chest',
  );
  const [equipmentId, setEquipmentId] = useState(
    exercise?.equipmentId ?? equipment[0]?.id ?? 'barbell',
  );

  const canSave = name.trim().length > 0 || Boolean(exercise?.nameKey);

  const save = async () => {
    const next: Exercise = exercise
      ? {
          ...exercise,
          name: name.trim() || undefined,
          muscleGroupId: muscle,
          equipmentId,
        }
      : {
          id: newId('ex'),
          nameKey: '',
          name: name.trim(),
          muscleGroupId: muscle,
          secondaryMuscleIds: [],
          equipmentId,
          movementPatternId: 'isolation',
          defaultRestSec: settings.restDefaultSec,
          incrementKg: APP_CONFIG.loadStep.kg,
          isCustom: true,
        };
    await services.repos.exercises.putMany([next]);
    toast(t('common.save'));
    onSaved?.(next);
    onClose();
  };

  return (
    <Sheet
      open
      title={exercise ? t('common.edit') : t('library.addCustom')}
      onClose={onClose}
      footer={
        <Button block size="lg" disabled={!canSave} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      }
    >
      <Field label={t('library.customName')}>
        <TextInput
          value={name}
          placeholder={exercise ? exerciseLabel(t, exercise) : ''}
          onInput={(event) => setName(event.currentTarget.value)}
          maxLength={60}
        />
      </Field>
      <Field label={t('library.filterMuscle')}>
        <Select value={muscle} onChange={(event) => setMuscle(event.currentTarget.value)}>
          {(muscles ?? []).map((group) => (
            <option key={group.id} value={group.id}>
              {t(group.nameKey)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('library.filterEquipment')}>
        <Select
          value={equipmentId}
          onChange={(event) => setEquipmentId(event.currentTarget.value)}
        >
          {(equipment ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {t(item.nameKey)}
            </option>
          ))}
        </Select>
      </Field>
    </Sheet>
  );
}
