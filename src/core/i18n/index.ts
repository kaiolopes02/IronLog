import { useEffect, useState } from 'preact/hooks';
import type { LocaleCode } from '@/domain/entities';
import en from '@/core/i18n/locales/en.json';
import ptBR from '@/core/i18n/locales/pt-BR.json';

export type Locale = LocaleCode;
type Dictionary = { [key: string]: string | Dictionary };

export const LOCALES: readonly Locale[] = ['pt-BR', 'en'];
export const LOCALE_LABELS: Record<Locale, string> = { 'pt-BR': 'Português', en: 'English' };

const DICTIONARIES: Record<Locale, Dictionary> = {
  'pt-BR': ptBR as Dictionary,
  en: en as Dictionary,
};

let current: Locale = 'pt-BR';
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  listeners.forEach((listener) => listener(locale));
}

function lookup(dictionary: Dictionary, key: string): string | undefined {
  const parts = key.split('.');
  let node: string | Dictionary | undefined = dictionary;
  for (const part of parts) {
    if (typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(
  key: string,
  params?: Record<string, string | number>,
  locale: Locale = current,
): string {
  const template =
    lookup(DICTIONARIES[locale], key) ??
    lookup(DICTIONARIES['pt-BR'], key) ??
    key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Preact hook: re-renders the caller whenever the locale changes. */
export function useI18n(): {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: Locale;
  changeLocale: (locale: Locale) => void;
} {
  const [locale, setLocaleState] = useState<Locale>(current);
  useEffect(() => {
    listeners.add(setLocaleState);
    return () => {
      listeners.delete(setLocaleState);
    };
  }, []);
  return {
    locale,
    changeLocale: setLocale,
    t: (key, params) => translate(key, params, locale),
  };
}

/** Label helper for seed catalogs: derives keys from ids. */
export const catalogKey = {
  exercise: (id: string) => `exerciseNames.${id}`,
  muscle: (id: string) => `muscleGroups.${id}`,
  equipment: (id: string) => `equipment.${id}`,
  pattern: (id: string) => `patterns.${id}`,
  setType: (id: string) => `setTypes.${id}`,
  metric: (id: string) => `metricTypes.${id}`,
  split: (id: string) => `splits.${id}.name`,
  splitDay: (splitId: string, index: number) => `splits.${splitId}.day${index + 1}`,
};

export function formatNumber(value: number, locale: Locale = current, digits = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}
