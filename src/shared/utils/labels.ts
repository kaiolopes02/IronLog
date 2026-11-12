import type { Exercise } from '@/domain/entities';

type Translate = (key: string) => string;

export function exerciseLabel(t: Translate, exercise: Exercise | undefined): string {
  if (!exercise) return '—';
  return exercise.name ?? t(exercise.nameKey);
}

export function pluralSets(count: number, t: Translate): string {
  return `${count} ${count === 1 ? t('common.set') : t('common.sets')}`;
}
