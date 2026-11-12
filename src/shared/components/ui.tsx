import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'subtle';

type ButtonProps = JSX.IntrinsicElements['button'] & {
  variant?: ButtonVariant;
  block?: boolean;
  size?: 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary active:bg-primary/90',
  outline: 'border border-line bg-surface text-ink active:bg-raised',
  ghost: 'text-muted active:bg-surface',
  danger: 'bg-danger text-white active:bg-danger/90',
  subtle: 'bg-raised text-ink active:bg-line',
};

export function Button({
  variant = 'primary',
  block,
  size = 'md',
  type = 'button',
  class: extra,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      class={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 disabled:pointer-events-none ${
        size === 'lg' ? 'min-h-[56px] px-5 text-base' : 'min-h-touch px-4 text-sm'
      } ${block ? 'w-full' : ''} ${VARIANTS[variant]} ${extra ?? ''}`}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  class: extra,
  ...rest
}: JSX.IntrinsicElements['button'] & { label: string; children?: ComponentChildren }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      class={`inline-flex min-h-touch min-w-touch items-center justify-center rounded-lg text-muted transition-colors duration-150 active:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40 ${
        extra ?? ''
      }`}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  class: extra,
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return (
    <div class={`rounded-xl border border-line bg-surface p-4 ${extra ?? ''}`}>{children}</div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section class="space-y-3">
      <header class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ComponentChildren;
  tone?: 'neutral' | 'primary' | 'success';
}) {
  const tones = {
    neutral: 'border-line bg-raised text-muted',
    primary: 'border-primary/40 bg-primary/10 text-primary',
    success: 'border-success/40 bg-success/10 text-success',
  } as const;
  return (
    <span
      class={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div class="rounded-xl border border-line bg-surface p-3">
      <p class="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p class="tnum mt-1 text-xl font-bold text-ink">{value}</p>
      {hint ? <p class="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ComponentChildren;
}) {
  return (
    <label class="block space-y-1.5">
      <span class="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint ? <span class="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  class: extra,
  ...rest
}: JSX.IntrinsicElements['input']) {
  return (
    <input
      {...rest}
      class={`min-h-touch w-full rounded-lg border border-line bg-raised px-3 text-base text-ink placeholder:text-muted focus:border-primary focus:outline-none ${
        extra ?? ''
      }`}
    />
  );
}

export function Select({
  children,
  class: extra,
  ...rest
}: JSX.IntrinsicElements['select']) {
  return (
    <select
      {...rest}
      class={`min-h-touch w-full appearance-none rounded-lg border border-line bg-raised px-3 text-base text-ink focus:border-primary focus:outline-none ${
        extra ?? ''
      }`}
    >
      {children}
    </select>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} class="flex gap-1 rounded-lg border border-line bg-surface p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          class={`min-h-touch flex-1 rounded-md px-2 text-sm font-medium transition-colors duration-150 ${
            option.value === value ? 'bg-raised text-ink' : 'text-muted'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      class={`relative inline-flex min-h-touch w-14 shrink-0 items-center rounded-full border transition-colors duration-150 ${
        checked ? 'border-primary bg-primary/20' : 'border-line bg-raised'
      }`}
    >
      <span
        class={`absolute h-6 w-6 rounded-full transition-transform duration-150 ${
          checked ? 'translate-x-6 bg-primary' : 'translate-x-1 bg-muted'
        }`}
      />
    </button>
  );
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'danger';
  children: ComponentChildren;
}) {
  const tones = {
    info: 'border-line bg-surface text-muted',
    warn: 'border-primary/40 bg-primary/10 text-ink',
    danger: 'border-danger/40 bg-danger/10 text-ink',
  } as const;
  return (
    <div class={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ComponentChildren;
}) {
  return (
    <div class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-4 py-8 text-center">
      <p class="text-sm font-medium text-ink">{title}</p>
      {hint ? <p class="text-xs text-muted">{hint}</p> : null}
      {action}
    </div>
  );
}

export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div class="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        class="absolute inset-0 bg-black/75"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        class="relative max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface pb-[max(16px,env(safe-area-inset-bottom))]"
      >
        <div class="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
          <h2 class="text-base font-semibold text-ink">{title}</h2>
          <IconButton label="close" onClick={onClose}>
            <span class="text-xl leading-none">×</span>
          </IconButton>
        </div>
        <div class="space-y-4 px-4 py-4">{children}</div>
        {footer ? <div class="border-t border-line px-4 pt-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Header({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ComponentChildren;
}) {
  return (
    <header class="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p class="text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function useLocalText(initial: string): [string, (value: string) => void] {
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  return [text, setText];
}
