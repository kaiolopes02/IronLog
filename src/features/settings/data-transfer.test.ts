import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG } from '@/core/config/app.config';
import { deriveKek, encryptJson, randomBytes } from '@/core/crypto/keyring';
import { IronLogDb } from '@/core/database/db';
import { seedDatabase, defaultSettings } from '@/core/database/repositories';
import { base64ToBytes, bytesToBase64 } from '@/shared/utils/base64';
import {
  buildBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  type BackupFile,
} from '@/features/settings/data-transfer';

let db: IronLogDb;

const PASSWORD = 'correct horse';

beforeEach(async () => {
  db = new IronLogDb(`ironlog-transfer-${Math.random().toString(36).slice(2)}`);
  await seedDatabase(db);
});

afterEach(async () => {
  await db.delete();
});

describe('backup encryption', () => {
  it('rejects a password shorter than the configured minimum', async () => {
    const weak = PASSWORD.slice(0, APP_CONFIG.security.backup.passwordMinLength - 1);
    await expect(serializeBackup(db, weak)).rejects.toThrow('weak password');
  });

  it('encrypts with the hardened work factor and decrypts the same data', async () => {
    const text = await serializeBackup(db, PASSWORD);
    const file = JSON.parse(text) as { kdf: { iterations: number } };
    expect(file.kdf.iterations).toBe(APP_CONFIG.security.backup.iterations);
    expect(file.kdf.iterations).toBeGreaterThanOrEqual(600_000);

    const backup = await parseBackup(text, PASSWORD);
    expect(backup.data.exercises).toHaveLength(await db.exercises.count());
  });

  it('rejects a hostile work factor before deriving a key', async () => {
    const text = JSON.stringify({
      app: 'ironlog',
      encrypted: true,
      version: 1,
      exportedAt: new Date().toISOString(),
      kdf: {
        iterations: APP_CONFIG.security.backup.maxIterations + 1,
        salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
      },
      payload: { iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' },
    });
    await expect(parseBackup(text, PASSWORD)).rejects.toThrow('invalid backup');
  });
  it('rejects an encrypted backup from a newer version', async () => {
    const kdf = { iterations: 1, salt: bytesToBase64(randomBytes(16)) };
    const key = await deriveKek(PASSWORD, base64ToBytes(kdf.salt), kdf.iterations);
    const payload = await encryptJson(key, {
      app: 'ironlog',
      version: APP_CONFIG.exportVersion + 1,
      exportedAt: '',
      data: {},
    });
    const text = JSON.stringify({
      app: 'ironlog',
      encrypted: true,
      version: APP_CONFIG.exportVersion,
      exportedAt: '',
      kdf,
      payload,
    });

    await expect(parseBackup(text, PASSWORD)).rejects.toThrow('newer version');
  });
});

describe('backup restore', () => {
  it('round-trips a valid backup', async () => {
    const backup = await buildBackup(db);
    await db.exercises.clear();
    expect(await db.exercises.count()).toBe(0);

    await restoreBackup(db, backup);
    expect(await db.exercises.count()).toBeGreaterThan(0);
  });

  it('rejects malformed rows without wiping existing data', async () => {
    const before = await db.exercises.count();
    const backup: BackupFile = {
      app: 'ironlog',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { exercises: [{ name: 'no primary key' }] },
    };

    await expect(restoreBackup(db, backup)).rejects.toThrow('invalid backup');
    expect(await db.exercises.count()).toBe(before);
  });
});

const VALID_ROWS: Record<string, Record<string, unknown>> = {
  meta: { key: 'seedVersion', value: '1' },
  settings: { key: 'app', value: defaultSettings() },
  exercises: {
    id: 'ex',
    nameKey: 'exerciseNames.ex',
    muscleGroupId: 'chest',
    secondaryMuscleIds: [],
    equipmentId: 'barbell',
    movementPatternId: 'push',
    defaultRestSec: 90,
    incrementKg: 2.5,
    isCustom: false,
  },
  muscleGroups: { id: 'chest', nameKey: 'muscleGroups.chest', sort: 1, defaultRestSec: 90 },
  equipment: { id: 'barbell', nameKey: 'equipment.barbell' },
  movementPatterns: { id: 'push', nameKey: 'patterns.push' },
  setTypes: { id: 'working', nameKey: 'setTypes.working', isWarmup: false, countsForVolume: true, countsForPR: true },
  splits: { id: 'ppl', nameKey: 'splits.ppl.name', dayNameKeys: ['splits.ppl.day1'], dayCount: 1 },
  metricTypes: { id: 'weight', nameKey: 'metricTypes.weight', unit: 'kg' },
  routines: {
    id: 'routine',
    name: 'Push',
    splitId: 'ppl',
    days: [{ id: 'day', name: 'Push', exerciseIds: ['ex'] }],
    createdAt: 1,
    updatedAt: 1,
  },
  sessions: {
    id: 'session',
    routineId: 'routine',
    dayId: 'day',
    name: 'Push',
    exerciseIds: ['ex'],
    startedAt: 1,
    finishedAt: null,
    status: 'active',
    timer: { durationSec: 90, endsAt: null, exerciseId: null },
    updatedAt: 1,
    noteRef: null,
  },
  sets: {
    id: 'set',
    sessionId: 'session',
    exerciseId: 'ex',
    order: 1,
    setTypeId: 'working',
    weight: 100,
    unit: 'kg',
    reps: 5,
    rpe: 8,
    rir: null,
    completed: true,
    completedAt: 2,
  },
  bodyMetrics: { id: 'metric', typeId: 'weight', value: 80, recordedAt: 3, noteRef: null },
  vault: {
    id: 'vault',
    target: 'session:session',
    updatedAt: 1,
    payload: { iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' },
  },
  security: {
    key: 'main',
    record: {
      version: 1,
      kdf: { iterations: 100_000, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' },
      wrappedDek: { iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' },
    },
  },
};

function backupWith(table: string, row: unknown): BackupFile {
  return { app: 'ironlog', version: 1, exportedAt: '', data: { [table]: [row] } };
}

describe('backup row validation', () => {
  it('accepts one valid row in every table', async () => {
    for (const [table, row] of Object.entries(VALID_ROWS)) {
      await restoreBackup(db, backupWith(table, row));
      expect(await db.table(table).count(), table).toBe(1);
    }
  });

  it('rejects a mistyped row in every table without touching data', async () => {
    const before = await db.exercises.count();

    for (const [table, row] of Object.entries(VALID_ROWS)) {
      const broken = { ...row };
      // Break one required field of each entity in a table-specific way.
      const key = Object.keys(broken).find((field) => field !== 'id' && field !== 'key') ?? 'id';
      broken[key] = 42;
      await expect(restoreBackup(db, backupWith(table, broken)), table).rejects.toThrow(
        'invalid backup',
      );
      expect(await db.exercises.count(), table).toBe(before);
    }
  });
});
