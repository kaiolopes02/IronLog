import { describe, expect, it } from 'vitest';
import en from '@/core/i18n/locales/en.json';
import ptBR from '@/core/i18n/locales/pt-BR.json';
import { seedCatalog, seedTextKeys, validateSeed } from '@/seed';

type Dict = { [key: string]: string | Dict };

function flatten(dict: Dict, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') keys.push(path);
    else keys.push(...flatten(value, path));
  }
  return keys.sort();
}

function hasKey(dict: Dict, path: string): boolean {
  let node: string | Dict | undefined = dict;
  for (const part of path.split('.')) {
    if (typeof node !== 'object') return false;
    node = node[part];
  }
  return typeof node === 'string';
}

describe('seed catalog', () => {
  it('has referential integrity', () => {
    expect(validateSeed(seedCatalog)).toEqual([]);
  });

  it('has no duplicate exercise ids', () => {
    const ids = new Set(seedCatalog.exercises.map((exercise) => exercise.id));
    expect(ids.size).toBe(seedCatalog.exercises.length);
  });

  it('derives every label from an i18n key present in both locales', () => {
    const keys = seedTextKeys(seedCatalog);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(hasKey(ptBR as Dict, key), `missing pt-BR key ${key}`).toBe(true);
      expect(hasKey(en as Dict, key), `missing en key ${key}`).toBe(true);
    }
  });

  it('keeps both dictionaries key-identical', () => {
    expect(flatten(en as Dict)).toEqual(flatten(ptBR as Dict));
  });

  it('gives every muscle group a positive rest default', () => {
    for (const group of seedCatalog.muscleGroups) {
      expect(group.defaultRestSec).toBeGreaterThan(0);
    }
  });
});
