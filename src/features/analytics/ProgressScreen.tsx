import { useCallback, useMemo, useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { navigate } from '@/app/router';
import { APP_CONFIG } from '@/core/config/app.config';
import { useI18n } from '@/core/i18n';
import { buildHeatmap } from '@/domain/services/heatmap';
import { estimateOneRepMax } from '@/domain/services/one-rep-max';
import { countsForPr } from '@/domain/services/records';
import { setTypeIndex, weeklyVolume } from '@/domain/services/volume';
import { chartHint } from '@/features/analytics/chart-hint';
import { useLiveQuery } from '@/shared/hooks/useLiveQuery';
import { Badge, Button, Card, EmptyState, Header, Select } from '@/shared/components/ui';
import { LineChart } from '@/shared/components/Chart';
import { THEME } from '@/shared/theme';
import { exerciseLabel } from '@/shared/utils/labels';
import { formatDate, toDateKey } from '@/shared/utils/date';
import { fromKg, toKg } from '@/shared/utils/units';

export default function ProgressScreen() {
  const { services, settings } = useApp();
  const { t, locale } = useI18n();
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const [exerciseId, setExerciseId] = useState('');

  const exercises = useLiveQuery(() => services.repos.exercises.all(), [services.repos], []);
  const setTypes = useLiveQuery(() => services.repos.catalog.setTypes(), [services.repos], []);
  const sets = useLiveQuery(
    () => services.repos.sets.allSince(yearStart),
    [services.repos, yearStart],
    [],
  );
  const sessions = useLiveQuery(
    () => services.repos.sessions.recent(400),
    [services.repos],
    [],
  );

  const typeIndex = useMemo(() => setTypeIndex(setTypes ?? []), [setTypes]);
  const completed = useMemo(() => (sets ?? []).filter((set) => set.completed), [sets]);

  const options = useMemo(() => {
    const withSets = new Set(completed.map((set) => set.exerciseId));
    return (exercises ?? []).filter((exercise) => withSets.has(exercise.id));
  }, [exercises, completed]);

  const currentId =
    exerciseId && options.some((exercise) => exercise.id === exerciseId)
      ? exerciseId
      : options[0]?.id ?? '';

  const chartPoints = useMemo(() => {
    if (!currentId) return [];
    const byDay = new Map<string, number>();
    for (const set of completed) {
      if (set.exerciseId !== currentId) continue;
      if (!countsForPr(set, typeIndex)) continue;
      const kg = toKg(set.weight, set.unit);
      if (kg <= 0) continue;
      const value = estimateOneRepMax(kg, set.reps, settings.formulaId);
      const key = toDateKey(set.completedAt);
      byDay.set(key, Math.max(byDay.get(key) ?? 0, value));
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({
        x: new Date(`${key}T12:00:00`).getTime(),
        y: fromKg(value, settings.unit),
      }))
      .slice(-APP_CONFIG.analytics.maxChartPoints);
  }, [completed, currentId, typeIndex, settings.formulaId, settings.unit]);

  const prSets = useMemo(
    () =>
      completed.filter(
        (set) => set.exerciseId === currentId && countsForPr(set, typeIndex),
      ),
    [completed, currentId, typeIndex],
  );
  const loadedSets = prSets.filter((set) => toKg(set.weight, set.unit) > 0).length;
  const hint = chartHint(prSets.length, loadedSets, chartPoints.length);

  const formatValue = useCallback(
    (value: number) =>
      `${Math.round(value * 10) / 10} ${settings.unit}`,
    [settings.unit],
  );

  const weeks = useMemo(
    () =>
      weeklyVolume(
        completed,
        exercises ?? [],
        typeIndex,
        APP_CONFIG.analytics.defaultWeeks,
        Date.now(),
        settings.weekStartsOn,
      ),
    [completed, exercises, typeIndex, settings.weekStartsOn],
  );

  const maxWeek = Math.max(1, ...weeks.map((week) => week.totalKg));

  const heatmap = useMemo(
    () =>
      buildHeatmap(
        (sessions ?? []).filter((session) => session.startedAt >= yearStart).map((session) => session.startedAt),
        year,
        settings.weekStartsOn,
      ),
    [sessions, year, yearStart, settings.weekStartsOn],
  );

  const records = useMemo(() => {
    const best = new Map<string, { e1rm: number; weight: number; at: number }>();
    for (const set of completed) {
      if (!countsForPr(set, typeIndex)) continue;
      const kg = toKg(set.weight, set.unit);
      const e1rm = estimateOneRepMax(kg, set.reps, settings.formulaId);
      const entry = best.get(set.exerciseId) ?? { e1rm: 0, weight: 0, at: set.completedAt };
      if (e1rm > entry.e1rm) {
        entry.e1rm = e1rm;
        entry.weight = kg;
        entry.at = set.completedAt;
      }
      best.set(set.exerciseId, entry);
    }
    return [...best.entries()]
      .sort((a, b) => b[1].e1rm - a[1].e1rm)
      .slice(0, APP_CONFIG.analytics.prLimit);
  }, [completed, typeIndex, settings.formulaId]);

  if (completed.length === 0) {
    return (
      <div class="space-y-4">
        <Header title={t('analytics.title')} />
        <div class="px-4">
          <EmptyState
            title={t('analytics.noData')}
            action={<Button onClick={() => navigate('/workouts')}>{t('home.startWorkout')}</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-5 pb-6">
      <Header
        title={t('analytics.title')}
        subtitle={`${completed.length} ${t('common.sets')} · ${heatmap.total} ${t('analytics.sessionsInYear')}`}
      />

      <section class="space-y-2 px-4">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
          {t('analytics.e1rm')}
        </h2>
        <Select value={currentId} onChange={(event) => setExerciseId(event.currentTarget.value)}>
          {options.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exerciseLabel(t, exercise)}
            </option>
          ))}
        </Select>
        <Card class="p-2">
          {hint === null ? (
            <LineChart
              points={chartPoints}
              label={t('analytics.e1rm')}
              format={formatValue}
            />
          ) : (
            <p class="px-2 py-3 text-xs text-muted">{t(`analytics.${hint}`)}</p>
          )}
        </Card>
      </section>

      <section class="space-y-2 px-4">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
          {t('analytics.weeklyVolume')}
        </h2>
        <Card class="space-y-3">
          <div class="flex h-32 items-end gap-1">
            {weeks.map((week) => (
              <div key={week.weekStart} class="flex flex-1 flex-col items-center gap-1">
                <div
                  class="w-full rounded-t bg-primary/80"
                  style={{ height: `${Math.max(2, Math.round((week.totalKg / maxWeek) * 100))}%` }}
                  title={`${Math.round(fromKg(week.totalKg, settings.unit))} ${settings.unit}`}
                />
              </div>
            ))}
          </div>
          <div class="flex justify-between text-[10px] text-muted">
            <span>{formatDate(weeks[0]?.weekStart ?? Date.now(), locale)}</span>
            <span>{t('analytics.last12')}</span>
          </div>
        </Card>
      </section>

      <section class="space-y-2 px-4">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
          {t('analytics.byMuscle')}
        </h2>
        <Card class="space-y-2">
          {(() => {
            const totals: Record<string, number> = {};
            for (const week of weeks) {
              for (const [muscle, value] of Object.entries(week.byMuscle)) {
                totals[muscle] = (totals[muscle] ?? 0) + value;
              }
            }
            const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
            const max = Math.max(1, ...entries.map(([, value]) => value));
            return entries.map(([muscle, value]) => (
              <div key={muscle} class="space-y-1">
                <div class="flex justify-between text-xs">
                  <span class="text-ink">{t(`muscleGroups.${muscle}`)}</span>
                  <span class="tnum text-muted">
                    {Math.round(fromKg(value, settings.unit))} {settings.unit}
                  </span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-line">
                  <div
                    class="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((value / max) * 100)}%` }}
                  />
                </div>
              </div>
            ));
          })()}
        </Card>
      </section>

      <section class="space-y-2 px-4">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
          {t('analytics.heatmap')} {year}
        </h2>
        <Card class="space-y-2 p-2">
          <div class="no-scrollbar overflow-x-auto">
            <div
              class="grid gap-[2px]"
              style={{
                gridAutoFlow: 'column',
                gridTemplateRows: 'repeat(7, 10px)',
                gridAutoColumns: '10px',
                width: `${heatmap.columnCount * 12}px`,
              }}
            >
              {heatmap.weeks.flat().map((cell, index) => (
                <div
                  key={index}
                  title={cell ? `${cell.date}: ${cell.count}` : ''}
                  style={{
                    backgroundColor: cell ? THEME.heat[cell.level] : 'transparent',
                  }}
                  class="rounded-[2px]"
                />
              ))}
            </div>
          </div>
          <div class="flex items-center justify-end gap-1 text-[10px] text-muted">
            <span>{t('analytics.period')}</span>
            {THEME.heat.map((color) => (
              <span
                key={color}
                class="h-2.5 w-2.5 rounded-[2px]"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </Card>
      </section>

      <section class="space-y-2 px-4">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
          {t('analytics.prs')}
        </h2>
        <Card class="space-y-2">
          {records.length === 0 ? (
            <p class="text-xs text-muted">{t('records.none')}</p>
          ) : (
            records.map(([id, record]) => {
              const exercise = (exercises ?? []).find((item) => item.id === id);
              return (
                <div key={id} class="flex items-center justify-between gap-2 border-b border-line pb-2">
                  <div class="min-w-0">
                    <p class="truncate text-sm text-ink">{exerciseLabel(t, exercise)}</p>
                    <p class="text-[11px] text-muted">{formatDate(record.at, locale)}</p>
                  </div>
                  <Badge tone="success">
                    {formatValue(fromKg(record.e1rm, settings.unit))}
                  </Badge>
                </div>
              );
            })
          )}
        </Card>
      </section>

      <div class="px-4">
        <Button block variant="outline" onClick={() => navigate('/body')}>
          {t('biometrics.title')}
        </Button>
      </div>
    </div>
  );
}
