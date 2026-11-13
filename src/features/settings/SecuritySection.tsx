import { useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { APP_CONFIG } from '@/core/config/app.config';
import { useI18n } from '@/core/i18n';
import { hasPasskey, passkeySupported, registerPasskey } from '@/features/security/passkey';
import { Badge, Banner, Button, Card, Field, Section, TextInput } from '@/shared/components/ui';
import { toast } from '@/shared/components/Toast';

export function SecuritySection() {
  const { services, security, unlocked, saveSecurity, setUnlocked } = useApp();
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [passkeyReady, setPasskeyReady] = useState(hasPasskey());

  const reset = () => {
    setPin('');
    setConfirmPin('');
    setError('');
  };

  const validate = (): boolean => {
    if (pin.length < APP_CONFIG.security.pinMinLength) {
      setError(t('security.pinTooShort'));
      return false;
    }
    if (pin !== confirmPin) {
      setError(t('security.pinMismatch'));
      return false;
    }
    return true;
  };

  const createPin = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const record = await services.crypto.create(pin);
      await saveSecurity(record);
      setUnlocked(true);
      reset();
      toast(t('security.enabled'));
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const changePin = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const record = await services.crypto.rewrap(pin);
      await saveSecurity(record);
      reset();
      toast(t('security.enabled'));
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const removePin = async () => {
    if (!window.confirm(t('security.removePinWarning'))) return;
    setBusy(true);
    try {
      const records = await services.repos.vault.all();
      await Promise.all(records.map((record) => services.repos.vault.remove(record.id)));
      services.crypto.lock();
      await saveSecurity(null);
      setUnlocked(true);
      toast(t('security.disabled'));
    } finally {
      setBusy(false);
    }
  };

  const lockNow = () => {
    services.crypto.lock();
    setUnlocked(false);
  };

  const addPasskey = async () => {
    const ok = await registerPasskey();
    setPasskeyReady(hasPasskey());
    toast(ok ? t('security.passkey') : t('security.passkeyUnsupported'));
  };

  return (
    <Section
      title={t('security.title')}
      action={<Badge tone={security ? 'success' : 'neutral'}>{security ? t('security.enabled') : t('security.disabled')}</Badge>}
    >
      <Card class="space-y-3">
        <p class="text-xs leading-relaxed text-muted">{t('security.subtitle')}</p>

        {security ? (
          <>
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs uppercase tracking-wide text-muted">{t('security.iterations')}</span>
              <span class="tnum text-sm text-ink">{security.kdf.iterations.toLocaleString()}</span>
            </div>
            <p class="text-[11px] text-muted">{t('security.calibrated')} · {t('security.noteEncrypted')}</p>
            <div class="flex gap-2">
              {unlocked ? (
                <Button variant="outline" block onClick={lockNow}>
                  {t('security.lockNow')}
                </Button>
              ) : null}
              {unlocked ? (
                <Button variant="danger" block disabled={busy} onClick={() => void removePin()}>
                  {t('security.removePin')}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}

        {security && !unlocked ? (
          <Banner tone="warn">{t('security.unlockBody')}</Banner>
        ) : (
          <>
            <Field label={security ? t('security.changePin') : t('security.setPin')}>
              <TextInput
                type="password"
                inputMode="numeric"
                maxLength={APP_CONFIG.security.pinMaxLength}
                value={pin}
                onInput={(event) => setPin(event.currentTarget.value.replace(/\D/g, ''))}
                placeholder={t('security.pin')}
              />
            </Field>
            <Field label={t('security.confirmPin')}>
              <TextInput
                type="password"
                inputMode="numeric"
                maxLength={APP_CONFIG.security.pinMaxLength}
                value={confirmPin}
                onInput={(event) => setConfirmPin(event.currentTarget.value.replace(/\D/g, ''))}
                placeholder={t('security.confirmPin')}
              />
            </Field>
            {error ? <p class="text-sm text-danger">{error}</p> : null}
            <Button block size="lg" disabled={busy || pin.length < APP_CONFIG.security.pinMinLength} onClick={() => void (security ? changePin() : createPin())}>
              {security ? t('security.changePin') : t('security.setPin')}
            </Button>
          </>
        )}
      </Card>

      <Card class="space-y-2">
        <p class="text-sm font-medium text-ink">{t('security.passkeyGate')}</p>
        <p class="text-xs leading-relaxed text-muted">{t('security.passkeyGateBody')}</p>
        {passkeySupported() ? (
          <Button variant="outline" block onClick={() => void addPasskey()}>
            {passkeyReady ? t('security.passkey') : t('security.registerPasskey')}
          </Button>
        ) : (
          <p class="text-xs text-muted">{t('security.passkeyUnsupported')}</p>
        )}
      </Card>
    </Section>
  );
}
