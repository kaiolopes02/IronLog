import { useMemo, useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { APP_CONFIG } from '@/core/config/app.config';
import { LOCALES, LOCALE_LABELS, useI18n, type Locale } from '@/core/i18n';
import { FORMULAS } from '@/domain/services/one-rep-max';
import { requestNotificationPermission } from '@/core/platform/notifier';
import { requestPersistentStorage, storageEstimate } from '@/core/platform/storage';
import { useLiveQuery } from '@/shared/hooks/useLiveQuery';
import {
  Badge,
  Banner,
  Button,
  Card,
  Header,
  Section,
  Segmented,
  Select,
  Toggle,
} from '@/shared/components/ui';
import { Stepper } from '@/shared/components/Stepper';
import { toast } from '@/shared/components/Toast';
import { DataSection } from '@/features/settings/DataSection';
import { SecuritySection } from '@/features/settings/SecuritySection';

export function SettingsScreen() {
  const { services, settings, updateSettings } = useApp();
  const capabilities = services.capabilities;
  const { t, locale } = useI18n();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);

  const muscles = useLiveQuery(() => services.repos.catalog.muscleGroups(), [services.repos], []);
  const formulaOptions = useMemo(
    () => FORMULAS.map((formula) => ({ value: formula.id, label: t(formula.nameKey) })),
    [t],
  );

  const askPersistence = async () => {
    const granted = await requestPersistentStorage();
    setPersisted(granted);
    const estimate = await storageEstimate();
    if (estimate) {
      setUsage(`${(estimate.usage / 1024 / 1024).toFixed(1)} MB / ${(estimate.quota / 1024 / 1024).toFixed(0)} MB`);
    }
    toast(granted ? t('settings.persistenceGranted') : t('settings.persistenceDenied'));
  };

  const enableNotifications = async () => {
    const granted = await requestNotificationPermission();
    await updateSettings({ timerNotifications: granted });
    if (!granted) toast(t('common.error'));
  };

  return (
    <div class="space-y-6 pb-8">
      <Header title={t('settings.title')} subtitle={t('app.offline')} />

      <div class="space-y-6 px-4">
        <Section title={t('settings.units')}>
          <Segmented
            label={t('settings.units')}
            value={settings.unit}
            onChange={(unit) => void updateSettings({ unit })}
            options={[
              { value: 'kg', label: t('common.kg') },
              { value: 'lb', label: t('common.lb') },
            ]}
          />
        </Section>

        <Section title={t('settings.language')}>
          <Segmented
            label={t('settings.language')}
            value={locale}
            onChange={(next) => void updateSettings({ locale: next as Locale })}
            options={LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] }))}
          />
          <p class="text-xs uppercase tracking-wide text-muted">{t('settings.weekStart')}</p>
          <Segmented
            label={t('settings.weekStart')}
            value={settings.weekStartsOn === 1 ? 'monday' : 'sunday'}
            onChange={(value) => void updateSettings({ weekStartsOn: value === 'monday' ? 1 : 0 })}
            options={[
              { value: 'monday', label: t('settings.monday') },
              { value: 'sunday', label: t('settings.sunday') },
            ]}
          />
        </Section>

        <Section title={t('settings.formula')}>
          <Select
            aria-label={t('settings.formula')}
            value={settings.formulaId}
            onChange={(event) => void updateSettings({ formulaId: event.currentTarget.value })}
          >
            {formulaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Section>

        <Section title={t('settings.rest')}>
          <Stepper
            label={t('settings.restDefault')}
            value={settings.restDefaultSec}
            step={15}
            min={15}
            max={900}
            suffix={t('common.seconds')}
            onChange={(restDefaultSec) => void updateSettings({ restDefaultSec })}
          />
          <div class="space-y-2">
            <p class="text-xs uppercase tracking-wide text-muted">{t('settings.restByMuscle')}</p>
            {(muscles ?? []).map((group) => (
              <div key={group.id} class="flex items-center justify-between gap-2">
                <span class="truncate text-sm text-ink">{t(group.nameKey)}</span>
                <div class="w-40 shrink-0">
                  <Stepper
                    label={t(group.nameKey)}
                    value={settings.restByMuscle[group.id] ?? group.defaultRestSec}
                    step={15}
                    min={15}
                    max={900}
                    compact
                    suffix={t('common.seconds')}
                    onChange={(seconds) =>
                      void updateSettings({
                        restByMuscle: { ...settings.restByMuscle, [group.id]: seconds },
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t('settings.plates')}>
          <Stepper
            label={t('settings.barWeight')}
            value={settings.barWeightKg}
            step={0.5}
            min={0}
            max={60}
            suffix={t('common.kg')}
            onChange={(barWeightKg) => void updateSettings({ barWeightKg })}
          />
          <p class="text-xs uppercase tracking-wide text-muted">{t('settings.inventory')}</p>
          {settings.plateStock.map((plate) => (
            <div key={plate.id} class="flex items-center justify-between gap-2">
              <span class="tnum truncate text-sm text-ink">
                {plate.weightKg} {t('common.kg')}
              </span>
              <div class="w-40 shrink-0">
                <Stepper
                  label={`${plate.weightKg} ${t('common.kg')}`}
                  value={plate.pairs}
                  step={1}
                  min={APP_CONFIG.plates.minPairs}
                  max={APP_CONFIG.plates.maxPairs}
                  compact
                  suffix={t('settings.pairs')}
                  onChange={(pairs) =>
                    void updateSettings({
                      plateStock: settings.plateStock.map((item) =>
                        item.id === plate.id ? { ...item, pairs } : item,
                      ),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </Section>

        <Section title={t('settings.timerSound')}>
          <Card class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-ink">{t('settings.timerSound')}</span>
              <Toggle
                label={t('settings.timerSound')}
                checked={settings.timerSound}
                onChange={(timerSound) => void updateSettings({ timerSound })}
              />
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-ink">{t('settings.timerVibration')}</span>
              <Toggle
                label={t('settings.timerVibration')}
                checked={settings.timerVibration}
                onChange={(timerVibration) => void updateSettings({ timerVibration })}
              />
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-ink">{t('settings.timerNotifications')}</span>
              <Toggle
                label={t('settings.timerNotifications')}
                checked={settings.timerNotifications}
                onChange={(checked) => {
                  if (checked) void enableNotifications();
                  else void updateSettings({ timerNotifications: false });
                }}
              />
            </div>
            {capabilities.notifications ? null : (
              <p class="text-xs text-muted">{t('settings.notificationsUnsupported')}</p>
            )}
          </Card>
        </Section>

        <SecuritySection />

        <DataSection />

        <Section title={t('settings.capabilities')}>
          <Card class="space-y-2">
            <div class="flex flex-wrap gap-1.5">
              <Badge tone={capabilities.wakeLock ? 'success' : 'neutral'}>Wake Lock</Badge>
              <Badge tone={capabilities.vibrate ? 'success' : 'neutral'}>Vibration</Badge>
              <Badge tone={capabilities.notifications ? 'success' : 'neutral'}>Notifications</Badge>
              <Badge tone={capabilities.webAuthn ? 'success' : 'neutral'}>WebAuthn</Badge>
              <Badge tone={capabilities.serviceWorker ? 'success' : 'neutral'}>Service Worker</Badge>
            </div>
            <p class="text-xs text-muted">
              {capabilities.hardwareConcurrency} cores ·{' '}
              {capabilities.prefersReducedMotion ? 'reduced motion' : 'full motion'}
            </p>
          </Card>
        </Section>

        <Section title={t('settings.persistence')}>
          <Card class="space-y-2">
            <p class="text-sm text-ink">
              {persisted === null
                ? t('settings.persistence')
                : persisted
                  ? t('settings.persistenceGranted')
                  : t('settings.persistenceDenied')}
            </p>
            {usage ? <p class="tnum text-xs text-muted">{usage}</p> : null}
            <Button variant="outline" block onClick={() => void askPersistence()}>
              {t('settings.enablePersistence')}
            </Button>
          </Card>
        </Section>

        <Section title={t('settings.about')}>
          <Card class="space-y-2">
            <Banner>{t('settings.offlineNote')}</Banner>
            <p class="text-xs text-muted">
              {t('app.version')} {APP_CONFIG.appName} · seed v{APP_CONFIG.seedVersion}
            </p>
            <p class="text-xs text-muted">{t('settings.privacy')}: 100% local, sem rede.</p>
          </Card>
        </Section>
      </div>
    </div>
  );
}
