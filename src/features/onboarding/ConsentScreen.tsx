import { useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { APP_CONFIG } from '@/core/config/app.config';
import { useI18n } from '@/core/i18n';
import { requestPersistentStorage } from '@/core/platform/storage';
import { Banner, Button, Card } from '@/shared/components/ui';
import { IconDumbbell } from '@/shared/components/icons';

export function ConsentScreen() {
  const { settings, updateSettings } = useApp();
  const { t } = useI18n();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    try {
      await requestPersistentStorage();
      await updateSettings({ consentVersion: APP_CONFIG.consentVersion });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="flex min-h-screen flex-col justify-center gap-6 px-5 py-10">
      <div class="space-y-3">
        <div class="flex items-center gap-3 text-primary">
          <IconDumbbell size={32} />
          <span class="text-xl font-bold tracking-tight text-ink">IronLog</span>
        </div>
        <h1 class="text-2xl font-bold text-ink">{t('onboarding.title')}</h1>
        <p class="text-sm leading-relaxed text-muted">{t('onboarding.body')}</p>
      </div>

      <Card class="space-y-3">
        <p class="text-sm text-ink">{t('onboarding.localOnly')}</p>
        <p class="text-sm text-muted">{t('onboarding.rights')}</p>
        <p class="text-xs text-muted">
          {t('settings.language')}: {settings.locale}
        </p>
      </Card>

      <label class="flex items-start gap-3 rounded-lg border border-line bg-surface p-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.currentTarget.checked)}
          class="mt-0.5 h-5 w-5 shrink-0 accent-[#F97316]"
        />
        <span class="text-sm text-ink">{t('onboarding.consentLabel')}</span>
      </label>

      <Banner>{t('onboarding.securityHint')}</Banner>

      <Button size="lg" block disabled={!checked || busy} onClick={accept}>
        {t('onboarding.start')}
      </Button>
    </div>
  );
}
