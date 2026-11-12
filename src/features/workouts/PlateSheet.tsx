import { useEffect, useState } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { useI18n } from '@/core/i18n';
import { distributePlates, loadTotalKg } from '@/domain/services/plates';
import { Stepper } from '@/shared/components/Stepper';
import { Button, Sheet } from '@/shared/components/ui';
import { convert, roundTo } from '@/shared/utils/units';

export interface PlateSheetProps {
  open: boolean;
  onClose: () => void;
  initialWeight: number;
  unit: 'kg' | 'lb';
}

export function PlateSheet({ open, onClose, initialWeight, unit }: PlateSheetProps) {
  const { settings } = useApp();
  const { t } = useI18n();
  const [target, setTarget] = useState(initialWeight);

  useEffect(() => {
    if (open) setTarget(initialWeight);
  }, [open, initialWeight]);

  const targetKg = convert(target, unit, 'kg');
  const solution = distributePlates(targetKg, settings.barWeightKg, settings.plateStock);
  const totalKg = loadTotalKg(settings.barWeightKg, solution);
  const display = (kg: number) => `${Math.round(convert(kg, 'kg', unit) * 100) / 100} ${unit}`;

  return (
    <Sheet open={open} title={t('plates.title')} onClose={onClose}>
      <Stepper
        label={t('plates.target')}
        value={target}
        onChange={setTarget}
        step={roundTo(convert(2.5, 'kg', unit), 0.5)}
        min={0}
        suffix={unit}
      />

      <div class="rounded-lg border border-line bg-raised p-3">
        <p class="text-xs uppercase tracking-wide text-muted">{t('plates.bar')}</p>
        <p class="tnum text-sm text-ink">{display(settings.barWeightKg)}</p>
      </div>

      <div class="rounded-lg border border-line bg-raised p-3">
        <p class="truncate text-xs uppercase tracking-wide text-muted">{t('plates.perSide')}</p>
        <p class="tnum truncate text-xs text-muted">
          {totalKg > 0 ? `${t('common.total')}: ${display(totalKg)}` : t('plates.empty')}
        </p>
        <div class="mt-1 flex flex-wrap items-center gap-1.5">
          {solution.perSide.length === 0 ? (
            <span class="text-sm text-muted">—</span>
          ) : (
            solution.perSide.map((plate) => (
              <span
                key={plate.plateId}
                class="tnum rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
              >
                {display(plate.weightKg)} × {plate.count}
              </span>
            ))
          )}
        </div>
        {solution.achievable ? null : (
          <p class="mt-2 text-xs text-danger">
            {t('plates.notAchievable')} ({t('plates.leftover')}:{' '}
            {display(solution.leftoverPerSideKg * 2)})
          </p>
        )}
      </div>

      <Button block variant="outline" onClick={onClose}>
        {t('common.close')}
      </Button>
    </Sheet>
  );
}
