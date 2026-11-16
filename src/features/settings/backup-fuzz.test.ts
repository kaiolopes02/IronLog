import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IronLogDb } from '@/core/database/db';
import { seedDatabase } from '@/core/database/repositories';
import {
  buildBackup,
  parseBackup,
  restoreBackup,
  type BackupFile,
} from '@/features/settings/data-transfer';

/** Deterministic PRNG (mulberry32) so a failing seed is reproducible. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHARS = '{}[]",:0123456789.eE+-_ \\/\'<>\u0000\u2028é😀';

function mutate(text: string, random: () => number): string {
  const at = Math.floor(random() * (text.length + 1));
  const char = CHARS[Math.floor(random() * CHARS.length)] ?? 'x';
  switch (Math.floor(random() * 3)) {
    case 0:
      return text.slice(0, at) + char + text.slice(at);
    case 1:
      return text.slice(0, at) + text.slice(at + 1);
    default:
      return text.slice(0, at) + char + text.slice(at + 1);
  }
}

function randomValue(random: () => number, depth = 0): unknown {
  const kind = Math.floor(random() * (depth > 3 ? 4 : 6));
  if (kind === 0) return null;
  if (kind === 1) return random() > 0.5;
  if (kind === 2) return (random() - 0.5) * 1e6;
  if (kind === 3) return 'x'.repeat(Math.floor(random() * 4));
  if (kind === 4) {
    return Array.from({ length: Math.floor(random() * 3) }, () => randomValue(random, depth + 1));
  }
  // Null-prototype object so a literal "__proto__" key survives JSON.stringify.
  const obj: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const keys = ['app', 'version', 'data', 'encrypted', 'kdf', 'payload', '__proto__', 'constructor'];
  for (const key of keys.slice(0, 1 + Math.floor(random() * keys.length))) {
    obj[key] = randomValue(random, depth + 1);
  }
  return obj;
}

async function counts(db: IronLogDb): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of db.tables) result[table.name] = await table.count();
  return result;
}

let db: IronLogDb;

beforeEach(async () => {
  db = new IronLogDb(`ironlog-fuzz-${Math.random().toString(36).slice(2)}`);
  await seedDatabase(db);
});

afterEach(async () => {
  await db.delete();
  delete (Object.prototype as { polluted?: unknown }).polluted;
});

describe('backup import fuzzing', () => {
  it(
    'mutated JSON never crashes, never pollutes and restores atomically',
    { timeout: 180_000 },
    async () => {
      const random = rng(0x1a2b3c);
      const seed = JSON.stringify(await buildBackup(db));
      let parsedCount = 0;
      let restoreRejects = 0;

      for (let i = 0; i < 200; i++) {
        let text = seed;
        for (let m = 1 + Math.floor(random() * 3); m > 0; m--) text = mutate(text, random);

        const outcome = await parseBackup(text).then(
          (value) => ({ backup: value }),
          (error: unknown) => ({ error }),
        );
        if ('error' in outcome) {
          expect(outcome.error).toBeInstanceOf(Error);
          continue;
        }

        const backup = outcome.backup;
        expect(backup.app).toBe('ironlog');
        parsedCount++;
        const before = await counts(db);
        try {
          await restoreBackup(db, backup);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect(await counts(db)).toEqual(before);
          restoreRejects++;
        }
        expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
      }
      expect(parsedCount).toBeGreaterThan(50);
      expect(restoreRejects).toBeGreaterThan(0);
    },
  );

  it(
    'arbitrary JSON values are rejected without side effects',
    { timeout: 60_000 },
    async () => {
      const random = rng(0xc0ffee);
      const before = await counts(db);

      for (let i = 0; i < 100; i++) {
        const serialized = JSON.stringify(randomValue(random));
        if (serialized === undefined) continue;

        try {
          await restoreBackup(db, await parseBackup(serialized));
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
        expect(await counts(db)).toEqual(before);
      }
      expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    },
  );

  it('rejects hostile encrypted envelopes before deriving a key', async () => {
    const before = await counts(db);
    const envelope = (kdf: unknown, payload: unknown = { iv: 'AAAA', data: 'AAAA' }) =>
      JSON.stringify({ app: 'ironlog', encrypted: true, version: 1, exportedAt: '', kdf, payload });

    for (const iterations of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER, '600000', 1_000_001]) {
      await expect(
        parseBackup(envelope({ iterations, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' }), 'password'),
      ).rejects.toThrow('invalid backup');
    }
    await expect(
      parseBackup(envelope({ iterations: 600_000, salt: 42 }), 'password'),
    ).rejects.toThrow('invalid backup');
    // Bounded work factor but a broken payload: fails in AES-GCM, not silently.
    await expect(
      parseBackup(envelope({ iterations: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' }), 'password'),
    ).rejects.toThrow();
    expect(await counts(db)).toEqual(before);
  });

  it('does not let a crafted row key reach Object.prototype', async () => {
    const poisoned = JSON.parse(
      '{"app":"ironlog","version":1,"exportedAt":"","data":{"meta":[{"key":"__proto__","value":"x","polluted":true}]}}',
    ) as BackupFile;
    await restoreBackup(db, poisoned);
    await db.meta.toArray();

    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    expect((Object.prototype as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it('rejects a security row that would lock the vault out', async () => {
    const valid = {
      version: 1,
      kdf: { iterations: 100_000, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' },
      wrappedDek: { iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' },
    };
    const backup = (record: unknown): BackupFile => ({
      app: 'ironlog',
      version: 1,
      exportedAt: '',
      data: { security: [{ key: 'main', record }] },
    });
    const before = await counts(db);

    for (const record of [
      {},
      { ...valid, kdf: { iterations: 1_000_000_000, salt: valid.kdf.salt } },
      { ...valid, kdf: { iterations: 100_000 } },
      { ...valid, wrappedDek: {} },
      { ...valid, version: 2 },
    ]) {
      await expect(restoreBackup(db, backup(record))).rejects.toThrow('invalid backup');
    }
    expect(await counts(db)).toEqual(before);

    await restoreBackup(db, backup(valid));
    expect(await db.security.get('main')).toEqual({ key: 'main', record: valid });
  });
});
