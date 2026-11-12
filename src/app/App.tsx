import { useCallback, useEffect, useState } from 'preact/hooks';
import { AppProvider } from '@/app/AppContext';
import { navigate } from '@/app/router';
import { Shell } from '@/app/Shell';
import type { BootResult } from '@/app/services';
import { APP_CONFIG } from '@/core/config/app.config';
import { setLocale } from '@/core/i18n';
import { ConsentScreen } from '@/features/onboarding/ConsentScreen';
import { UnlockScreen } from '@/features/security/UnlockScreen';
import { ToastHost } from '@/shared/components/Toast';
import type { AppSettings, SecurityRecord } from '@/domain/entities';

export function App({ bootResult }: { bootResult: BootResult }) {
  const [settings, setSettings] = useState<AppSettings>(bootResult.settings);
  const [security, setSecurity] = useState<SecurityRecord | null>(bootResult.security);
  const [unlocked, setUnlocked] = useState(!bootResult.security);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = await bootResult.services.repos.settings.patch(patch);
      setSettings(next);
      if (patch.locale) setLocale(patch.locale);
      return next;
    },
    [bootResult.services.repos.settings],
  );

  const saveSecurity = useCallback(
    async (record: SecurityRecord | null) => {
      if (record) await bootResult.services.repos.security.put(record);
      else await bootResult.services.repos.security.clear();
      setSecurity(record);
      await updateSettings({ securityEnabled: record !== null });
    },
    [bootResult.services.repos.security, updateSettings],
  );

  useEffect(() => {
    if (bootResult.activeSessionId && !bootResult.security) navigate('/session');
  }, [bootResult.activeSessionId, bootResult.security]);

  const needsConsent = settings.consentVersion !== APP_CONFIG.consentVersion;
  const locked = security !== null && !unlocked;

  return (
    <AppProvider
      value={{
        services: bootResult.services,
        settings,
        security,
        unlocked,
        updateSettings,
        saveSecurity,
        setUnlocked,
      }}
    >
      <div class="mx-auto min-h-screen w-full max-w-xl bg-bg">
        {needsConsent ? (
          <ConsentScreen />
        ) : locked ? (
          <UnlockScreen />
        ) : (
          <Shell />
        )}
      </div>
      <ToastHost />
    </AppProvider>
  );
}
