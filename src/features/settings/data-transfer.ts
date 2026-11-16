import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
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

function isEnvelope(value: unknown): boolean {
  return isRecord(value) && typeof value.iv === 'string' && typeof value.data === 'string';
}

const isStr = (value: unknown): value is string => typeof value === 'string';
const isNum = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isBool = (value: unknown): value is boolean => typeof value === 'boolean';
const isStrList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isStr);
const isNullableStr = (value: unknown): boolean => value === null || isStr(value);
const isNullableNum = (value: unknown): boolean => value === null || isNum(value);
const isOptional = (check: (value: unknown) => boolean) => (value: unknown) =>
  value === undefined || check(value);

function isSettings(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.restByMuscle)) return false;
  return (
    isNullableStr(value.consentVersion) &&
    (value.locale === 'pt-BR' || value.locale === 'en') &&
    (value.unit === 'kg' || value.unit === 'lb') &&
    (value.weekStartsOn === 0 || value.weekStartsOn === 1) &&
    isNum(value.restDefaultSec) &&
    Object.values(value.restByMuscle).every(isNum) &&
    Array.isArray(value.plateStock) &&
    value.plateStock.every(
      (item) => isRecord(item) && isStr(item.id) && isNum(item.weightKg) && isNum(item.pairs),
    ) &&
    isNum(value.barWeightKg) &&
    isBool(value.securityEnabled) &&
    isBool(value.timerVibration) &&
    isBool(value.timerNotifications) &&
    isStr(value.formulaId)
  );
}

/**
 * A restored security row is the only row that can brick the app: boot sends
 * any non-null record straight to the unlock screen, so a malformed one makes
 * every PIN fail and `iterations` becomes an unauthenticated PBKDF2 cost.
 */
function isSecurityRecordRow(row: unknown): boolean {
  if (!isRecord(row) || row.key !== 'main' || !isRecord(row.record)) return false;
  const { version, kdf, wrappedDek } = row.record;
  if (version !== 1 || !isRecord(kdf) || !isEnvelope(wrappedDek)) return false;
  const { iterations, salt } = kdf;
  return (
    typeof iterations === 'number' &&
    Number.isInteger(iterations) &&
    iterations > 0 &&
    iterations <= APP_CONFIG.security.kdf.maxIterations &&
    typeof salt === 'string'
  );
}

/**
 * One validator per table. Restore clears everything first, so a row that
 * cannot be rendered must be rejected before the transaction. Adding or
 * removing an entity field means bumping `exportVersion` and this map.
 */
const ROW_CHECKS: Record<string, (row: unknown) => boolean> = {
  meta: (row) => isRecord(row) && isStr(row.key) && isStr(row.value),
  settings: (row) => isRecord(row) && row.key === 'app' && isSettings(row.value),
  exercises: (row) =>
    isRecord(row) &&
    isStr(row.id) &&
    isStr(row.nameKey) &&
    isOptional(isStr)(row.name) &&
    isStr(row.muscleGroupId) &&
    isStrList(row.secondaryMuscleIds) &&
    isStr(row.equipmentId) &&
    isStr(row.movementPatternId) &&
    isNum(row.defaultRestSec) &&
    isNum(row.incrementKg) &&
    isBool(row.isCustom) &&
    isOptional(isBool)(row.archived),
  muscleGroups: (row) =>
    isRecord(row) &&
    isStr(row.id) &&
    isStr(row.nameKey) &&
    isNum(row.sort) &&
    isNum(row.defaultRestSec),
  equipment: (row) => isRecord(row) && isStr(row.id) && isStr(row.nameKey),
  movementPatterns: (row) => isRecord(row) && isStr(row.id) && isStr(row.nameKey),
  setTypes: (row) =>
    isRecord(row) &&
    isStr(row.id) &&
    isStr(row.nameKey) &&
    isBool(row.isWarmup) &&
    isBool(row.countsForVolume) &&
    isBool(row.countsForPR),
  splits: (row) =>
    isRecord(row) && isStr(row.id) && isStr(row.nameKey) && isStrList(row.dayNameKeys) && isNum(row.dayCount),
  metricTypes: (row) => isRecord(row) && isStr(row.id) && isStr(row.nameKey) && isStr(row.unit),
  routines: (row) =>
    isRecord(row) &&
    isStr(row.id) &&
    isStr(row.name) &&
    isStr(row.splitId) &&
    Array.isArray(row.days) &&
    row.days.every(
      (day) =>
        isRecord(day) &&
        isStr(day.id) &&
        isStr(day.name) &&
        isOptional(isStr)(day.nameKey) &&
        isStrList(day.exerciseIds),
    ) &&
    isNum(row.createdAt) &&
    isNum(row.updatedAt),
  sessions: (row) =>
    isRecord(row) &&
    isStr(row.id) &&
    isNullableStr(row.routineId) &&
    isNullableStr(row.dayId) &&
    isStr(row.name) &&
    isStrList(row.exerciseIds) &&
    isNum(row.startedAt) &&
    isNullableNum(row.finishedAt) &&
    (row.status === 'active' || row.status === 'completed' || row.status === 'abandoned') &&
    (row.timer === null ||
      (isRecord(row.timer) &&
        isNum(row.timer.durationSec) &&
        isNullableNum(row.timer.endsAt) &&
        isNullableStr(row.timer.exerciseId))) &&
    isNum(row.updatedAt) &&
    isNullableStr(row.noteRef),
  sets: (row) =>
    isRecord(row) &&
    isStr(row.id) &&
    isStr(row.sessionId) &&
    isStr(row.exerciseId) &&
    isNum(row.order) &&
    isStr(row.setTypeId) &&
    isNum(row.weight) &&
    (row.unit === 'kg' || row.unit === 'lb') &&
    isNum(row.reps) &&
    isNullableNum(row.rpe) &&
    isNullableNum(row.rir) &&
    isBool(row.completed) &&
    isNum(row.completedAt),
  bodyMetrics: (row) =>
    isRecord(row) &&
    isStr(row.id) &&
    isStr(row.typeId) &&
    isNum(row.value) &&
    isNum(row.recordedAt) &&
    isNullableStr(row.noteRef),
  vault: (row) =>
    isRecord(row) && isStr(row.id) && isStr(row.target) && isNum(row.updatedAt) && isEnvelope(row.payload),
  security: isSecurityRecordRow,
};

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
    if (decrypted.version > APP_CONFIG.exportVersion) throw new Error('backup from a newer version');
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
    if (rows === undefined) continue;
    const check = ROW_CHECKS[table.name] ?? hasPrimaryKey;
    if (!Array.isArray(rows) || !rows.every(check)) throw new Error('invalid backup');
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

export async function downloadFile(
  filename: string,
  content: string,
  type: string,
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // A blob: URL behind <a download> is silently dropped by the WebView, so
    // write the file and hand it to the share sheet instead.
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    // Dismissing the share sheet is not an export failure: the file is written.
    await Share.share({ url: uri, title: filename }).catch(() => undefined);
    return;
  }
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
