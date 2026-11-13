import { useApp } from '@/app/AppContext';
import { useI18n } from '@/core/i18n';
import { isElapsed, progress, remainingMs } from '@/domain/services/rest-timer';
import { extendRest, skipRest } from '@/features/workouts/session-actions';
import { useNow } from '@/shared/hooks/useNow';
import { Button } from '@/shared/components/ui';
import { formatClock } from '@/shared/utils/date';
import type { WorkoutSession } from '@/domain/entities';

/** Resilient rest timer: everything is derived from the persisted end timestamp. */
export function RestTimerBar({ session }: { session: WorkoutSession }) {
  const { services } = useApp();
  const { t } = useI18n();
  const timer = session.timer;
  const running = timer !== null && timer.endsAt !== null;
  const now = useNow(running, 250);

  const done = timer !== null && isElapsed(timer, now);

  if (!timer || timer.endsAt === null) return null;

  const left = remainingMs(timer, now);

  return (
    <div
      class={`sticky top-0 z-20 border-b px-4 py-2 ${
        done ? 'animate-pulse border-primary bg-primary/15' : 'border-line bg-surface'
      }`}
      role="status"
      aria-live="polite"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-[11px] uppercase tracking-wide text-muted">
            {done ? t('workout.restDone') : t('workout.rest')}
          </p>
          <p class="tnum text-2xl font-bold text-ink">
            {done ? '0:00' : formatClock(left)}
          </p>
        </div>
        <div class="flex items-center gap-1">
          <Button variant="outline" onClick={() => void extendRest(services.repos, session, -15)}>
            −15s
          </Button>
          <Button variant="outline" onClick={() => void extendRest(services.repos, session, 15)}>
            +15s
          </Button>
          <Button variant="subtle" onClick={() => void skipRest(services.repos, session)}>
            {t('workout.skipRest')}
          </Button>
        </div>
      </div>
      <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
        <div
          class="h-full bg-primary transition-all duration-300"
          style={{ width: `${Math.round(progress(timer, now) * 100)}%` }}
        />
      </div>
    </div>
  );
}
