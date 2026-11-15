import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { navigate } from '@/app/router';
import { useI18n } from '@/core/i18n';
import {
  cancelRestAlarm,
  notify,
  playRestBeep,
  restAlarmPlayed,
  scheduleRestAlarm,
  vibrate,
} from '@/core/platform/notifier';
import { isElapsed } from '@/domain/services/rest-timer';
import { skipRest } from '@/features/workouts/session-actions';
import { useRestTimerWorker } from '@/features/workouts/useRestTimerWorker';
import { useLiveQuery } from '@/shared/hooks/useLiveQuery';
import { useNow } from '@/shared/hooks/useNow';
import { Button, Sheet } from '@/shared/components/ui';

export function RestAlert() {
  const { services, settings } = useApp();
  const { t } = useI18n();
  const session = useLiveQuery(() => services.repos.sessions.findActive(), [services.repos]);
  const timer = session?.timer ?? null;
  const running = timer !== null && timer.endsAt !== null;
  const now = useNow(running, 1000);
  const firedFor = useRef<number | null>(null);
  const done = timer !== null && isElapsed(timer, now);

  // Arm the alarm on the audio clock: it fires at `endsAt` even when the JS
  // timers are throttled or frozen in the background.
  useEffect(() => {
    const endsAt = timer?.endsAt ?? null;
    // Native has no sound without a notification, so either switch arms it.
    const armed = settings.timerSound || settings.timerNotifications;
    if (endsAt === null || !armed || endsAt <= Date.now()) {
      cancelRestAlarm();
      return;
    }
    scheduleRestAlarm(endsAt);
    // No unmount cleanup: a vault auto-lock unmounts this tree and must not
    // silence an alarm that is already armed.
  }, [timer?.endsAt, settings.timerSound, settings.timerNotifications]);

  // One alert per deadline, whatever fires it first.
  const alertFor = useCallback(
    (endsAt: number) => {
      if (firedFor.current === endsAt) return;
      firedFor.current = endsAt;
      if (settings.timerSound && !restAlarmPlayed(endsAt)) playRestBeep(endsAt);
      if (settings.timerVibration) vibrate();
      if (settings.timerNotifications) notify(t('workout.restDone'), t('workout.restDoneBody'));
    },
    [settings.timerSound, settings.timerVibration, settings.timerNotifications, t],
  );

  // The worker beats hidden-tab timer clamping; the `done` effect covers the
  // return to the app and browsers without workers.
  useRestTimerWorker(timer?.endsAt ?? null, alertFor);

  useEffect(() => {
    if (done && timer?.endsAt) alertFor(timer.endsAt);
  }, [done, timer?.endsAt, alertFor]);

  if (!done || !session) return null;

  const dismiss = async () => {
    await skipRest(services.repos, session);
    navigate('/session');
  };

  return (
    <Sheet open persistent title={t('workout.restDone')} onClose={() => void dismiss()}>
      <p class="text-sm text-muted">{t('workout.restDoneBody')}</p>
      <Button block size="lg" onClick={() => void dismiss()}>
        {t('workout.restDoneAction')}
      </Button>
    </Sheet>
  );
}
