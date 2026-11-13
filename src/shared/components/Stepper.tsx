import { useEffect, useRef, useState } from 'preact/hooks';
import { IconMinus, IconPlus } from '@/shared/components/icons';

export interface StepperProps {
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  decimals?: number;
  compact?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function format(value: number, decimals: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(decimals);
}

/**
 * 48px tap targets. Typing is a fallback path: the +/- path is what makes the
 * three-tap logging flow work.
 */
export function Stepper({
  label,
  value,
  step,
  onChange,
  min = 0,
  max = 9999,
  suffix,
  decimals = 2,
  compact,
}: StepperProps) {
  const [text, setText] = useState(() => format(value, decimals));
  const editing = useRef(false);

  useEffect(() => {
    // A late value echo (DB round-trip) must not rewrite text the user is
    // editing; blur normalizes it.
    if (editing.current) return;
    setText(format(value, decimals));
  }, [value, decimals]);

  const commit = (raw: string) => {
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setText(format(value, decimals));
      return;
    }
    const next = clamp(parsed, min, max);
    setText(format(next, decimals));
    if (next !== value) onChange(next);
  };

  // Out-of-range intermediate keystrokes must not reach onChange, or the
  // value effect would rewrite the input text mid-typing.
  const preview = (raw: string) => {
    setText(raw);
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
    if (parsed !== value) onChange(parsed);
  };

  const bump = (direction: 1 | -1) => {
    // Base on the visible text: a just-committed value may not have reached the
    // `value` prop yet, and +/- must add to what the user sees.
    const typed = Number(text.replace(',', '.'));
    const base = Number.isFinite(typed) ? clamp(typed, min, max) : value;
    const next = Math.round(clamp(base + step * direction, min, max) * 1000) / 1000;
    setText(format(next, decimals));
    onChange(next);
  };

  return (
    <div class="space-y-1">
      <span class="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
        {suffix ? ` · ${suffix}` : ''}
      </span>
      <div class="flex items-stretch overflow-hidden rounded-lg border border-line bg-raised">
        <button
          type="button"
          aria-label={`${label} -`}
          onClick={() => bump(-1)}
          disabled={value <= min}
          class="flex min-h-touch min-w-touch items-center justify-center text-muted active:bg-line disabled:opacity-30"
        >
          <IconMinus size={18} />
        </button>
        <div class="flex min-w-0 flex-1 items-center justify-center">
          <input
            aria-label={label}
            inputMode="decimal"
            value={text}
            onInput={(event) => preview(event.currentTarget.value)}
            onFocus={() => {
              editing.current = true;
            }}
            onBlur={(event) => {
              editing.current = false;
              commit(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit(event.currentTarget.value);
            }}
            class={`tnum w-full min-w-0 bg-transparent px-1 text-center font-bold text-ink focus:outline-none ${
              compact ? 'text-base' : 'text-xl'
            }`}
          />
        </div>
        <button
          type="button"
          aria-label={`${label} +`}
          onClick={() => bump(1)}
          disabled={value >= max}
          class="flex min-h-touch min-w-touch items-center justify-center text-muted active:bg-line disabled:opacity-30"
        >
          <IconPlus size={18} />
        </button>
      </div>
    </div>
  );
}
