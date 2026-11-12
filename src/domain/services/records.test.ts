import { describe, expect, it } from 'vitest';
import { detectPersonalRecords } from '@/domain/services/records';
import { SET_TYPES, makeSet } from '../../../tests/factories';

describe('personal records', () => {
  it('detects a new estimated 1RM and a new max load', () => {
    const history = [makeSet({ weight: 100, reps: 5 })];
    const candidates = [makeSet({ weight: 105, reps: 5, completedAt: 10 })];
    const records = detectPersonalRecords(history, candidates, SET_TYPES, 'epley');
    const kinds = records.map((record) => record.kindId).sort();
    expect(kinds).toEqual(['e1rm', 'weight']);
    expect(records.every((record) => record.before > 0)).toBe(true);
  });

  it('returns nothing when history is better', () => {
    const history = [makeSet({ weight: 120, reps: 5 })];
    const candidates = [makeSet({ weight: 100, reps: 5 })];
    expect(detectPersonalRecords(history, candidates, SET_TYPES, 'epley')).toEqual([]);
  });

  it('ignores warm-up and pending candidates', () => {
    const history = [makeSet({ weight: 100, reps: 5 })];
    const candidates = [
      makeSet({ weight: 150, reps: 5, setTypeId: 'warmup' }),
      makeSet({ weight: 150, reps: 5, completed: false }),
    ];
    expect(detectPersonalRecords(history, candidates, SET_TYPES, 'epley')).toEqual([]);
  });

  it('compares across units', () => {
    const history = [makeSet({ weight: 100, unit: 'kg', reps: 1 })];
    const candidates = [makeSet({ weight: 230, unit: 'lb', reps: 1 })];
    const records = detectPersonalRecords(history, candidates, SET_TYPES, 'epley');
    expect(records.some((record) => record.kindId === 'weight')).toBe(true);
  });
});
