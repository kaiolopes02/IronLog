import { APP_CONFIG } from '@/core/config/app.config';
import { decryptWithPassword, encryptWithPassword } from '@/core/crypto/keyring';
import type { IronLogDb } from '@/core/database/db';
import type { KdfParams, KeyEnvelope, SetType } from '@/domain/entities';
import { setTypeIndex, setVolumeKg } from '@/domain/services/volume';
import { translate, type Locale } from '@/core/i18n';
import { toCsv } from '@/shared/utils/csv';
import { formatDate } from '@/shared/utils/date';

export interface BackupFile {
  app: 'ironlog';
  version: number;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

export interface EncryptedBackupFile {
  app: 'ironlog';
  encrypted: true;
  version: number;
  exportedAt: string;
  kdf: KdfParams;
  payload: KeyEnvelope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function buildBackup(db: IronLogDb): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    data[table.name] = await table.toArray();
  }
  return {
    app: 'ironlog',
    version: APP_CONFIG.exportVersion,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export async function serializeBackup(db: IronLogDb, password?: string): Promise<string> {
  const backup = await buildBackup(db);
  if (!password) return JSON.stringify(backup, null, 2);
  if (password.length < APP_CONFIG.security.backup.passwordMinLength) {
    throw new Error('weak password');
  }
  const encrypted = await encryptWithPassword(backup, password);
  const file: EncryptedBackupFile = {
    app: 'ironlog',
    encrypted: true,
    version: APP_CONFIG.exportVersion,
    exportedAt: backup.exportedAt,
    kdf: encrypted.kdf,
    payload: encrypted.payload,
  };
  return JSON.stringify(file, null, 2);
}

export function isEncryptedBackup(value: unknown): value is EncryptedBackupFile {
  if (!isRecord(value) || value.app !== 'ironlog' || value.encrypted !== true) return false;
  if (!isRecord(value.kdf) || !isRecord(value.payload)) return false;
  const { iterations, salt } = value.kdf;
  return (
    typeof iterations === 'number' &&
    Number.isInteger(iterations) &&
    iterations > 0 &&
    iterations <= APP_CONFIG.security.backup.maxIterations &&
    typeof salt === 'string'
  );
}

function isBackupFile(value: unknown): value is BackupFile {
  return (
    isRecord(value) &&
    value.app === 'ironlog' &&
    typeof value.version === 'number' &&
    isRecord(value.data)
  );
}

export async function parseBackup(text: string, password?: string): Promise<BackupFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('invalid file');
  }
  if (isEncryptedBackup(parsed)) {
    if (!password) throw new Error('password required');
    const decrypted = await decryptWithPassword<unknown>(parsed.payload, password, parsed.kdf);
    if (!isBackupFile(decrypted)) throw new Error('invalid backup');
    return decrypted;
  }
  if (!isBackupFile(parsed)) throw new Error('invalid backup');
  if (parsed.version > APP_CONFIG.exportVersion) throw new Error('backup from a newer version');
  return parsed;
}

function hasPrimaryKey(value: unknown): boolean {
  return isRecord(value) && (typeof value.id === 'string' || typeof value.key === 'string');
}

export async function restoreBackup(db: IronLogDb, backup: BackupFile): Promise<void> {
  for (const table of db.tables) {
    const rows = backup.data[table.name];
    if (rows !== undefined && (!Array.isArray(rows) || !rows.every(hasPrimaryKey))) {
      throw new Error('invalid backup');
    }
  }
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = backup.data[table.name];
      if (Array.isArray(rows) && rows.length > 0) await table.bulkPut(rows);
    }
  });
}

export async function buildCsv(db: IronLogDb, locale: Locale): Promise<string> {
  const [sets, exercises, sessions, setTypes] = await Promise.all([
    db.sets.toArray(),
    db.exercises.toArray(),
    db.sessions.toArray(),
    db.setTypes.toArray(),
  ]);
  const typeIndex: Record<string, SetType> = setTypeIndex(setTypes);
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));

  const rows = sets
    .filter((set) => set.completed)
    .sort((a, b) => a.completedAt - b.completedAt)
    .map((set) => {
      const exercise = exerciseById.get(set.exerciseId);
      const name = exercise?.name ?? (exercise ? translate(exercise.nameKey, undefined, locale) : set.exerciseId);
      return {
        date: formatDate(set.completedAt, locale),
        workout: sessionById.get(set.sessionId)?.name ?? '',
        exercise: name,
        type: typeIndex[set.setTypeId] ? translate(typeIndex[set.setTypeId].nameKey, undefined, locale) : set.setTypeId,
        weight: set.weight,
        unit: set.unit,
        reps: set.reps,
        rpe: set.rpe ?? '',
        volumeKg: Math.round(setVolumeKg(set, typeIndex)),
      };
    });

  return toCsv(rows, [
    { header: 'date', value: (row) => row.date },
    { header: 'workout', value: (row) => row.workout },
    { header: 'exercise', value: (row) => row.exercise },
    { header: 'set_type', value: (row) => row.type },
    { header: 'weight', value: (row) => row.weight },
    { header: 'unit', value: (row) => row.unit },
    { header: 'reps', value: (row) => row.reps },
    { header: 'rpe', value: (row) => row.rpe },
    { header: 'volume_kg', value: (row) => row.volumeKg },
  ]);
}

export function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
