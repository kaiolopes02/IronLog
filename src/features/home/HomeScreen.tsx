import { useMemo } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { navigate } from '@/app/router';
import { useI18n } from '@/core/i18n';
import { volumeLoadKg } from '@/domain/services/volume';
import type { SetType } from '@/domain/entities';
import { startSession } from '@/features/workouts/session-actions';
import { useLiveQuery } from '@/shared/hooks/useLiveQuery';
import { Badge, Button, Card, EmptyState, Header, Stat } from '@/shared/components/ui';
import { IconChevronRight, IconFlame, IconPlay } from '@/shared/components/icons';
import { formatDate, formatDurationShort, startOfWeek, toDateKey } from '@/shared/utils/date';
import { formatNumber } from '@/core/i18n';

function streakDays(starts: readonly number[]): number {
  const days = new Set(starts.map((ts) => toDateKey(ts)));
  let streak = 0;
  const cursor = new Date();
  for (let index = 0; index < 365; index++) {
    const key = toDateKey(cursor.getTime());
    if (days.has(key)) {
      streak += 1;
    } else if (index > 0) {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function HomeScreen() {
  const { services, settings } = useApp();
  const { t, locale } = useI18n();
  const weekStart = startOfWeek(Date.now(), settings.weekStartsOn);

  const active = useLiveQuery(() => services.repos.sessions.findActive(), [services.repos]);
  const routines = useLiveQuery(() => services.repos.routines.all(), [services.repos], []);
  const recent = useLiveQuery(() => services.repos.sessions.recent(5), [services.repos], []);
  const weekSets = useLiveQuery(
    () => services.repos.sets.allSince(weekStart),
    [services.repos, weekStart],
    [],
  );
  const weekSessions = useLiveQuery(
    async () => (await services.repos.sessions.recent(50)).filter((s) => s.startedAt >= weekStart),
    [services.repos, weekStart],
    [],
  );
  const setTypes = useLiveQuery(() => services.repos.catalog.setTypes(), [services.repos], []);
  const allSessions = useLiveQuery(() => services.repos.sessions.recent(365), [services.repos], []);

  const typeIndex = useMemo(() => {
    const index: Record<string, SetType> = {};
    for (const type of setTypes ?? []) index[type.id] = type;
    return index;
  }, [setTypes]);

  const volume = volumeLoadKg(weekSets ?? [], typeIndex);
  const streak = streakDays((allSessions ?? []).map((session) => session.startedAt));

  const quickStart = async () => {
    await startSession(services.repos, { name: t('home.quickStart') });
    navigate('/session');
  };

  return (
    <div class="space-y-5 pb-6">
      <Header
        title={t('home.greeting')}
        subtitle={t('app.tagline')}
        action={<Badge tone="primary">{t('app.offline')}</Badge>}
      />

      {active ? (
        <div class="px-4">
          <button
            type="button"
            onClick={() => navigate('/session')}
            class="flex w-full items-center justify-between gap-3 rounded-xl border border-primary/50 bg-primary/10 p-4 text-left active:bg-primary/20"
          >
            <span>
              <span class="block text-xs uppercase tracking-wide text-primary">
                {t('home.resumeHint')}
              </span>
              <span class="block truncate text-base font-semibold text-ink">{active.name}</span>
            </span>
            <IconPlay size={22} class="shrink-0 text-primary" />
          </button>
        </div>
      ) : null}

      <div class="grid grid-cols-3 gap-2 px-4">
        <Stat label={t('home.sessions')} value={String((weekSessions ?? []).length)} />
        <Stat label={t('home.volume')} value={`${formatNumber(volume, locale)} ${settings.unit}`} />
        <Stat label={t('home.streak')} value={`${streak} ${t('home.days')}`} />
      </div>

      <div class="grid grid-cols-2 gap-2 px-4">
        <Button size="lg" onClick={() => navigate('/workouts')}>
          <IconPlay size={18} /> {t('home.startWorkout')}
        </Button>
        <Button size="lg" variant="outline" onClick={() => void quickStart()}>
          {t('home.quickStart')}
        </Button>
      </div>

      <section class="space-y-2 px-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
            {t('routines.title')}
          </h2>
          <button
            type="button"
            class="flex min-h-touch items-center gap-1 text-xs text-primary"
            onClick={() => navigate('/workouts')}
          >
            {t('common.all')} <IconChevronRight size={14} />
          </button>
        </div>
        {routines.length === 0 ? (
          <EmptyState
            title={t('home.noRoutine')}
            action={<Button onClick={() => navigate('/workouts')}>{t('home.createRoutine')}</Button>}
          />
        ) : (
          routines.slice(0, 2).map((routine) => (
            <Card key={routine.id} class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="truncate text-sm font-semibold text-ink">{routine.name}</p>
                <Badge>{routine.days.length} {t('routines.days')}</Badge>
              </div>
              <div class="flex flex-wrap gap-2">
                {routine.days.map((day) => (
                  <button
                    key={day.id}
                    type="button"
                    onClick={async () => {
                      await startSession(services.repos, {
                        name: day.nameKey ? t(day.nameKey) : day.name,
                        routineId: routine.id,
                        dayId: day.id,
                        exerciseIds: day.exerciseIds,
                      });
                      navigate('/session');
                    }}
                    class="flex min-h-touch items-center gap-1 rounded-lg border border-line bg-raised px-3 text-xs font-medium text-ink active:bg-line"
                  >
                    <IconPlay size={14} />
                    {day.nameKey ? t(day.nameKey) : day.name}
                  </button>
                ))}
              </div>
            </Card>
          ))
        )}
      </section>

      <section class="space-y-2 px-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
            {t('home.recent')}
          </h2>
          <button
            type="button"
            class="flex min-h-touch items-center gap-1 text-xs text-primary"
            onClick={() => navigate('/workouts')}
          >
            {t('home.viewHistory')} <IconChevronRight size={14} />
          </button>
        </div>
        {recent.length === 0 ? (
          <p class="text-xs text-muted">{t('workout.emptyHistory')}</p>
        ) : (
          recent.map((session) => (
            <div
              key={session.id}
              class="flex items-center justify-between gap-2 border-b border-line py-2"
            >
              <div class="min-w-0">
                <p class="truncate text-sm text-ink">{session.name}</p>
                <p class="text-xs text-muted">{formatDate(session.startedAt, locale)}</p>
              </div>
              <span class="tnum text-xs text-muted">
                {formatDurationShort((session.finishedAt ?? session.startedAt) - session.startedAt)}
              </span>
            </div>
          ))
        )}
      </section>

      <div class="flex items-center gap-2 px-4 text-xs text-muted">
        <IconFlame size={16} class="text-primary" />
        {t('settings.offlineNote')}
      </div>
    </div>
  );
}
