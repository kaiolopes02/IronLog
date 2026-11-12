import { useApp } from '@/app/AppContext';
import { navigate } from '@/app/router';
import { useI18n } from '@/core/i18n';
import type { WorkoutSession } from '@/domain/entities';
import { discardSession, startSession } from '@/features/workouts/session-actions';
import { useLiveQuery } from '@/shared/hooks/useLiveQuery';
import { Badge, Button, Card, EmptyState, Header, IconButton } from '@/shared/components/ui';
import { IconChevronRight, IconPlay, IconPlus, IconTrash } from '@/shared/components/icons';
import { toast } from '@/shared/components/Toast';
import { formatDateTime, formatDurationShort } from '@/shared/utils/date';

export function WorkoutsScreen() {
  const { services } = useApp();
  const { t, locale } = useI18n();

  const routines = useLiveQuery(() => services.repos.routines.all(), [services.repos], []);
  const history = useLiveQuery(() => services.repos.sessions.recent(20), [services.repos], []);

  const startDay = async (routineId: string, dayId: string, name: string, exerciseIds: string[]) => {
    await startSession(services.repos, { name, routineId, dayId, exerciseIds });
    navigate('/session');
  };

  const reopen = async (session: WorkoutSession) => {
    if (await services.repos.sessions.findActive()) {
      toast(t('home.resumeHint'));
      return;
    }
    await services.repos.sessions.put({
      ...session,
      status: 'active',
      finishedAt: null,
      updatedAt: Date.now(),
    });
    navigate('/session');
  };

  const removeSession = async (session: WorkoutSession) => {
    if (!window.confirm(t('workout.deleteConfirm'))) return;
    await discardSession(services.repos, session);
  };

  return (
    <div class="space-y-5 pb-6">
      <Header
        title={t('routines.title')}
        subtitle={t('routines.split')}
        action={
          <Button onClick={() => navigate('/workouts/edit')}>
            <IconPlus size={16} /> {t('routines.new')}
          </Button>
        }
      />

      <div class="space-y-2 px-4">
        {routines.length === 0 ? (
          <EmptyState
            title={t('routines.empty')}
            action={<Button onClick={() => navigate('/workouts/edit')}>{t('routines.new')}</Button>}
          />
        ) : (
          routines.map((routine) => (
            <Card key={routine.id} class="space-y-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-ink">{routine.name}</p>
                  <p class="text-xs text-muted">
                    {t(`splits.${routine.splitId}.name`)} · {routine.days.length}{' '}
                    {t('routines.days')}
                  </p>
                </div>
                <div class="flex shrink-0">
                  <IconButton
                    label={t('common.edit')}
                    onClick={() => navigate(`/workouts/edit/${routine.id}`)}
                  >
                    <IconChevronRight size={18} />
                  </IconButton>
                  <IconButton
                    label={t('common.delete')}
                    onClick={async () => {
                      if (!window.confirm(t('routines.deleteConfirm'))) return;
                      await services.repos.routines.remove(routine.id);
                    }}
                  >
                    <IconTrash size={18} />
                  </IconButton>
                </div>
              </div>

              <div class="space-y-2">
                {routine.days.map((day) => (
                  <div
                    key={day.id}
                    class="flex items-center justify-between gap-2 rounded-lg border border-line bg-raised p-2"
                  >
                    <div class="min-w-0">
                      <p class="truncate text-sm text-ink">
                        {day.nameKey ? t(day.nameKey) : day.name}
                      </p>
                      <p class="text-[11px] text-muted">
                        {day.exerciseIds.length} {t('common.exercises')}
                      </p>
                    </div>
                    <Button
                      variant="subtle"
                      onClick={() =>
                        void startDay(
                          routine.id,
                          day.id,
                          day.nameKey ? t(day.nameKey) : day.name,
                          day.exerciseIds,
                        )
                      }
                    >
                      <IconPlay size={16} /> {t('routines.startDay')}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>

      <section class="space-y-2 px-4">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
          {t('workout.history')}
        </h2>
        {history.length === 0 ? (
          <p class="text-xs text-muted">{t('workout.emptyHistory')}</p>
        ) : (
          history.map((session) => (
            <div
              key={session.id}
              class="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm text-ink">{session.name}</p>
                <p class="text-[11px] text-muted">{formatDateTime(session.startedAt, locale)}</p>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <Badge>{formatDurationShort((session.finishedAt ?? 0) - session.startedAt)}</Badge>
                <IconButton label={t('workout.reopen')} onClick={() => void reopen(session)}>
                  <IconPlay size={16} />
                </IconButton>
                <IconButton label={t('common.delete')} onClick={() => void removeSession(session)}>
                  <IconTrash size={16} />
                </IconButton>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
