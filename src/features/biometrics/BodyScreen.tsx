import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { useI18n } from '@/core/i18n';
import type { BodyMetric } from '@/domain/entities';
import { useVault } from '@/features/security/vault';
import { useLiveQuery } from '@/shared/hooks/useLiveQuery';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Header,
  IconButton,
  Select,
  Sheet,
} from '@/shared/components/ui';
import { Stepper } from '@/shared/components/Stepper';
import { LineChart } from '@/shared/components/Chart';
import { IconPencil, IconPlus } from '@/shared/components/icons';
import { formatDate, startOfDay } from '@/shared/utils/date';
import { newId } from '@/shared/utils/id';

function SecureNote({ id }: { id: string | null }) {
  const vault = useVault();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void vault.get<{ note: string }>(id).then((value) => {
      if (alive) setText(value?.note ?? null);
    });
    return () => {
      alive = false;
    };
  }, [id, vault.get]);

  if (!text) return null;
  return <p class="mt-1 text-xs text-muted">{text}</p>;
}

export function BodyScreen() {
  const { services } = useApp();
  const { t, locale } = useI18n();
  const vault = useVault();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BodyMetric | null>(null);
  const [typeId, setTypeId] = useState('');
  const [value, setValue] = useState(80);
  const [note, setNote] = useState('');

  const openCreate = () => {
    setEditing(null);
    setTypeId('');
    setValue(80);
    setNote('');
    setFormOpen(true);
  };

  const openEdit = (metric: BodyMetric) => {
    setEditing(metric);
    setTypeId(metric.typeId);
    setValue(metric.value);
    setNote('');
    setFormOpen(true);
  };

  const metrics = useLiveQuery(() => services.repos.metrics.all(), [services.repos], []);
  const types = useLiveQuery(() => services.repos.catalog.metricTypes(), [services.repos], []);

  const currentTypeId =
    typeId && (types ?? []).some((type) => type.id === typeId)
      ? typeId
      : (types ?? [])[0]?.id ?? '';

  const latestByType = useMemo(() => {
    const map = new Map<string, BodyMetric>();
    for (const metric of metrics ?? []) {
      if (!map.has(metric.typeId)) map.set(metric.typeId, metric);
    }
    return map;
  }, [metrics]);

  const weightPoints = useMemo(
    () =>
      (metrics ?? [])
        .filter((metric) => metric.typeId === 'bodyweight')
        .slice(0, 60)
        .reverse()
        .map((metric) => ({ x: startOfDay(metric.recordedAt), y: metric.value })),
    [metrics],
  );

  const save = async () => {
    let noteRef = editing?.noteRef ?? null;
    if (note.trim() && vault.available) {
      noteRef = await vault.put('body-metric', { note: note.trim() });
    }
    await services.repos.metrics.put({
      id: editing?.id ?? newId('bm'),
      typeId: currentTypeId,
      value,
      recordedAt: editing?.recordedAt ?? Date.now(),
      noteRef,
    });
    setNote('');
    setFormOpen(false);
  };

  return (
    <div class="space-y-4 pb-6">
      <Header
        title={t('biometrics.title')}
        action={
          <Button onClick={openCreate}>
            <IconPlus size={16} /> {t('biometrics.add')}
          </Button>
        }
      />

      {metrics.length === 0 ? (
        <div class="px-4">
          <EmptyState
            title={t('biometrics.noData')}
            action={<Button onClick={openCreate}>{t('biometrics.add')}</Button>}
          />
        </div>
      ) : (
        <>
          <div class="grid grid-cols-2 gap-2 px-4">
            {(types ?? []).map((type) => {
              const latest = latestByType.get(type.id);
              return (
                <div key={type.id} class="rounded-xl border border-line bg-surface p-3">
                  <p class="truncate text-[11px] uppercase tracking-wide text-muted">
                    {t(type.nameKey)}
                  </p>
                  <p class="tnum text-lg font-bold text-ink">
                    {latest ? `${latest.value} ${type.unit}` : '—'}
                  </p>
                  {latest ? (
                    <p class="text-[10px] text-muted">{formatDate(latest.recordedAt, locale)}</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {weightPoints.length > 1 ? (
            <div class="px-4">
              <Card class="p-2">
                <LineChart points={weightPoints} label={t('metricTypes.bodyweight')} height={160} />
              </Card>
            </div>
          ) : null}

          <section class="space-y-2 px-4">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
              {t('biometrics.history')}
            </h2>
            {(metrics ?? []).slice(0, 20).map((metric) => {
              const type = (types ?? []).find((item) => item.id === metric.typeId);
              return (
                <div key={metric.id} class="rounded-lg border border-line bg-surface px-3 py-2">
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <p class="truncate text-sm text-ink">{type ? t(type.nameKey) : metric.typeId}</p>
                      <p class="text-[11px] text-muted">{formatDate(metric.recordedAt, locale)}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <Badge tone="primary">
                        {metric.value} {type?.unit}
                      </Badge>
                      <IconButton label={t('common.edit')} onClick={() => openEdit(metric)}>
                        <IconPencil size={16} />
                      </IconButton>
                      <button
                        type="button"
                        class="min-h-touch min-w-touch text-xs text-muted"
                        onClick={() => void services.repos.metrics.remove(metric.id)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {metric.noteRef ? <SecureNote id={metric.noteRef} /> : null}
                </div>
              );
            })}
          </section>
        </>
      )}

      <Sheet
        open={formOpen}
        title={editing ? t('common.edit') : t('biometrics.add')}
        onClose={() => setFormOpen(false)}
      >
        <Field label={t('biometrics.type')}>
          <Select value={currentTypeId} onChange={(event) => setTypeId(event.currentTarget.value)}>
            {(types ?? []).map((type) => (
              <option key={type.id} value={type.id}>
                {t(type.nameKey)} ({type.unit})
              </option>
            ))}
          </Select>
        </Field>

        <Stepper
          label={t('biometrics.value')}
          value={value}
          onChange={setValue}
          step={0.1}
          min={0}
          max={500}
          suffix={(types ?? []).find((type) => type.id === currentTypeId)?.unit}
        />

        <Field label={t('biometrics.note')} hint={vault.available ? t('security.noteEncrypted') : t('biometrics.lockedHint')}>
          <textarea
            value={note}
            maxLength={500}
            disabled={!vault.available}
            onInput={(event) => setNote(event.currentTarget.value)}
            class="min-h-[88px] w-full rounded-lg border border-line bg-raised px-3 py-2 text-base text-ink placeholder:text-muted focus:border-primary focus:outline-none disabled:opacity-40"
            placeholder={vault.available ? '' : t('biometrics.lockedNote')}
          />
        </Field>

        <Button block size="lg" onClick={() => void save()}>
          {t('common.save')}
        </Button>
      </Sheet>
    </div>
  );
}
