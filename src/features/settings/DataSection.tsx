import { useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { APP_CONFIG } from '@/core/config/app.config';
import { useI18n } from '@/core/i18n';
import { wipeEverything } from '@/core/platform/storage';
import {
  buildCsv,
  downloadFile,
  parseBackup,
  restoreBackup,
  serializeBackup,
} from '@/features/settings/data-transfer';
import { Banner, Button, Card, Field, Section, TextInput } from '@/shared/components/ui';
import { toast } from '@/shared/components/Toast';

export function DataSection() {
  const { services } = useApp();
  const { t, locale } = useI18n();
  const [password, setPassword] = useState('');
  const [wipeText, setWipeText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stamp = new Date().toISOString().slice(0, 10);

  const exportJson = async (encrypted: boolean) => {
    if (encrypted && password.length < APP_CONFIG.security.backup.passwordMinLength) {
      setError(t('settings.passwordHint'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const text = await serializeBackup(services.db, encrypted ? password : undefined);
      downloadFile(
        `ironlog-${stamp}${encrypted ? '-encrypted' : ''}.json`,
        text,
        'application/json',
      );
      toast(t('settings.exported'));
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    setBusy(true);
    try {
      downloadFile(`ironlog-${stamp}.csv`, await buildCsv(services.db, locale), 'text/csv');
      toast(t('settings.exported'));
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const backup = await parseBackup(await file.text(), password || undefined);
      await restoreBackup(services.db, backup);
      toast(t('settings.imported'));
      location.reload();
    } catch {
      setError(t('settings.wrongPassword'));
    } finally {
      setBusy(false);
    }
  };

  const wipe = async () => {
    if (wipeText.trim().toUpperCase() !== t('settings.wipeToken')) return;
    setBusy(true);
    try {
      await wipeEverything(services.db);
      toast(t('settings.wipeDone'));
      location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t('settings.data')}>
      <Card class="space-y-3">
        <Field label={t('settings.password')} hint={t('settings.passwordHint')}>
          <TextInput
            type="password"
            value={password}
            autocomplete="new-password"
            onInput={(event) => setPassword(event.currentTarget.value)}
          />
        </Field>

        <div class="grid gap-2">
          <Button variant="outline" block disabled={busy} onClick={() => void exportJson(false)}>
            {t('settings.exportJson')}
          </Button>
          <Button variant="outline" block disabled={busy} onClick={() => void exportJson(true)}>
            {t('settings.exportEncrypted')}
          </Button>
          <Button variant="outline" block disabled={busy} onClick={() => void exportCsv()}>
            {t('settings.exportCsv')}
          </Button>
        </div>

        <label class="block space-y-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-muted">
            {t('settings.import')}
          </span>
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importFile(file);
            }}
            class="block w-full rounded-lg border border-line bg-raised px-3 py-2 text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-on-primary"
          />
        </label>
        <Banner tone="warn">{t('settings.importWarning')}</Banner>
        {error ? <p class="text-sm text-danger">{error}</p> : null}
      </Card>

      <Card class="space-y-3 border-danger/40">
        <p class="text-sm font-semibold text-ink">{t('settings.wipe')}</p>
        <p class="text-xs leading-relaxed text-muted">{t('settings.wipeWarning')}</p>
        <Field label={t('settings.wipeConfirm')}>
          <TextInput
            value={wipeText}
            autocomplete="off"
            onInput={(event) => setWipeText(event.currentTarget.value)}
            placeholder={t('settings.wipeToken')}
          />
        </Field>
        <Button
          variant="danger"
          block
          disabled={busy || wipeText.trim().toUpperCase() !== t('settings.wipeToken')}
          onClick={() => void wipe()}
        >
          {t('settings.wipe')}
        </Button>
      </Card>
    </Section>
  );
}
