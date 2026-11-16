import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG } from '@/core/config/app.config';
import { deriveKek, encryptJson, randomBytes } from '@/core/crypto/keyring';
import { IronLogDb } from '@/core/database/db';
import { seedDatabase } from '@/core/database/repositories';
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
