import { useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { useI18n } from '@/core/i18n';
import { Button, Card, TextInput } from '@/shared/components/ui';
import { IconLock } from '@/shared/components/icons';

export function UnlockScreen() {
  const { services, security, setUnlocked } = useApp();
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!security) return;
    setBusy(true);
    setError('');
    try {
      const ok = await services.crypto.unlock(security, pin);
      if (ok) {
        setUnlocked(true);
      } else {
        setError(t('security.wrongPin'));
        setPin('');
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="flex min-h-screen flex-col justify-center gap-5 px-5">
      <div class="flex flex-col items-center gap-2 text-primary">
        <IconLock size={40} />
        <h1 class="text-xl font-bold text-ink">{t('security.unlockTitle')}</h1>
        <p class="text-center text-sm text-muted">{t('security.unlockBody')}</p>
      </div>

      <Card class="space-y-3">
        <label class="block space-y-1.5">
          <span class="text-xs uppercase tracking-wide text-muted">{t('security.pin')}</span>
          <TextInput
            type="password"
            inputMode="numeric"
            autocomplete="current-password"
            maxLength={12}
            value={pin}
            onInput={(event) => setPin(event.currentTarget.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
            class="tnum text-center text-2xl tracking-[0.4em]"
          />
        </label>
        {error ? <p class="text-sm text-danger">{error}</p> : null}
        <Button block size="lg" disabled={pin.length < 4 || busy} onClick={submit}>
          {t('security.unlock')}
        </Button>
      </Card>
    </div>
  );
}
