const KG_PER_LB = 0.45359237;

export function toKg(value: number, unit: 'kg' | 'lb'): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function fromKg(value: number, unit: 'kg' | 'lb'): number {
  return unit === 'kg' ? value : value / KG_PER_LB;
}

export function convert(value: number, from: 'kg' | 'lb', to: 'kg' | 'lb'): number {
  if (from === to) return value;
  return fromKg(toKg(value, from), to);
}

export function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function roundDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Loads always display one decimal, dropping a trailing .0 as little as possible. */
export function formatLoad(value: number, unit: string): string {
  const rounded = roundDecimals(value, 2);
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${text} ${unit}`;
}
