import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '@/core/i18n';
import { checkExactAlarmPermission, requestExactAlarmPermission } from '@/core/platform/notifier';
import { Button, Sheet } from '@/shared/components/ui';

/**
 * Android 12+ delays an inexact alarm by minutes, so ask once when the workout
 * screen opens and send the user straight to the system toggle. Off-native the
 * check answers `true` and nothing renders.
 */
export function ExactAlarmPrompt() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void checkExactAlarmPermission().then((granted) => setOpen(!granted));
  }, []);

  return (
    <Sheet open={open} title={t('settings.exactAlarm')} onClose={() => setOpen(false)}>
      <p class="text-sm text-muted">{t('workout.exactAlarmBody')}</p>
      <Button
        block
        size="lg"
        onClick={async () => {
          await requestExactAlarmPermission();
          setOpen(false);
        }}
      >
        {t('workout.exactAlarmAction')}
      </Button>
    </Sheet>
  );
}
