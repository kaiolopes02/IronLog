/**
 * 1RM registry. Adding a formula = appending one entry to `FORMULAS`;
 * no component or business function needs to change.
 */
export interface OneRepMaxFormula {
  id: string;
  nameKey: string;
  estimate: (weight: number, reps: number) => number;
}

export const epley: OneRepMaxFormula = {
  id: 'epley',
  nameKey: 'formulas.epley',
  estimate: (weight, reps) => (reps <= 1 ? weight : weight * (1 + reps / 30)),
};

export const brzycki: OneRepMaxFormula = {
  id: 'brzycki',
  nameKey: 'formulas.brzycki',
  estimate: (weight, reps) => {
    if (reps <= 1) return weight;
    if (reps >= 37) return weight;
    return (weight * 36) / (37 - reps);
  },
};

export const FORMULAS: readonly OneRepMaxFormula[] = [epley, brzycki];

export const DEFAULT_FORMULA_ID = epley.id;

export function getFormula(id: string): OneRepMaxFormula {
  return FORMULAS.find((formula) => formula.id === id) ?? epley;
}

export function estimateOneRepMax(
  weight: number,
  reps: number,
  formulaId: string = DEFAULT_FORMULA_ID,
): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return 0;
  if (weight <= 0 || reps <= 0) return 0;
  const value = getFormula(formulaId).estimate(weight, reps);
  return Math.round(value * 10) / 10;
}
