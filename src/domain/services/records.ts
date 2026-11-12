import type { PersonalRecord, RecordKindId, SetType, WorkoutSet } from '@/domain/entities';
import { estimateOneRepMax } from '@/domain/services/one-rep-max';
import { toKg } from '@/shared/utils/units';

/**
 * PR rules are data. Add a rule here to add a badge everywhere in the UI.
 */
export interface RecordRule {
  id: RecordKindId;
  nameKey: string;
  metric: (set: WorkoutSet, formulaId: string) => number;
}

export const RECORD_RULES: readonly RecordRule[] = [
  {
    id: 'e1rm',
    nameKey: 'records.e1rm',
    metric: (set, formulaId) =>
      estimateOneRepMax(toKg(set.weight, set.unit), set.reps, formulaId),
  },
  {
    id: 'weight',
    nameKey: 'records.weight',
    metric: (set) => toKg(set.weight, set.unit),
  },
];

export function countsForPr(set: WorkoutSet, setTypes: Record<string, SetType>): boolean {
  if (!set.completed) return false;
  const type = setTypes[set.setTypeId];
  return type ? type.countsForPR : true;
}

function bestByRule(
  sets: readonly WorkoutSet[],
  rule: RecordRule,
  setTypes: Record<string, SetType>,
  formulaId: string,
): number {
  let best = 0;
  for (const set of sets) {
    if (!countsForPr(set, setTypes)) continue;
    best = Math.max(best, rule.metric(set, formulaId));
  }
  return best;
}

/**
 * Returns one record per rule for the best candidate set that strictly beat
 * history. Empty when nothing is new.
 */
export function detectPersonalRecords(
  history: readonly WorkoutSet[],
  candidates: readonly WorkoutSet[],
  setTypes: Record<string, SetType>,
  formulaId: string,
): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  const exercises = new Set(candidates.map((set) => set.exerciseId));

  for (const exerciseId of exercises) {
    const past = history.filter((set) => set.exerciseId === exerciseId);
    const current = candidates.filter((set) => set.exerciseId === exerciseId);
    for (const rule of RECORD_RULES) {
      const before = bestByRule(past, rule, setTypes, formulaId);
      let best = before;
      let bestSet: WorkoutSet | undefined;
      for (const set of current) {
        if (!countsForPr(set, setTypes)) continue;
        const value = rule.metric(set, formulaId);
        if (value > best + 1e-6) {
          best = value;
          bestSet = set;
        }
      }
      if (bestSet) {
        records.push({
          exerciseId,
          kindId: rule.id,
          value: Math.round(best * 10) / 10,
          before: Math.round(before * 10) / 10,
          achievedAt: bestSet.completedAt,
          setId: bestSet.id,
        });
      }
    }
  }
  return records;
}
