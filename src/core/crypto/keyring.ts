import { APP_CONFIG } from '@/core/config/app.config';
import type { KeyEnvelope, KdfParams, SecurityRecord } from '@/domain/entities';
import { base64ToBytes, bytesToBase64 } from '@/shared/utils/base64';

const KDF = APP_CONFIG.security.kdf;

function subtle(): SubtleCrypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto unavailable');
  }
  return crypto.subtle;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function importPin(pin: string): Promise<CryptoKey> {
  return subtle().importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey']);
}

export async function deriveKek(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    await importPin(pin),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface CalibrationOptions {
  probeTargetMs: number;
  probeIterations: number;
  minIterations: number;
  maxIterations: number;
  roundTo: number;
}

export const defaultCalibration: CalibrationOptions = {
  probeTargetMs: KDF.probeTargetMs,
  probeIterations: KDF.probeIterations,
  minIterations: KDF.minIterations,
  maxIterations: KDF.maxIterations,
  roundTo: KDF.roundTo,
};

/**
 * Micro-benchmark: measures PBKDF2 once, projects the iteration count that
 * lands on ~50 ms, then clamps inside the LGPD-friendly 100k–310k window.
 */
export async function calibrateIterations(
  options: CalibrationOptions = defaultCalibration,
): Promise<number> {
  const key = await importPin('calibration-probe');
  const salt = randomBytes(16);
  const started = now();
  await deriveKekRaw(key, salt, options.probeIterations);
  const elapsed = Math.max(1, now() - started);
  const projected = (options.probeTargetMs / elapsed) * options.probeIterations;
  const rounded = Math.round(projected / options.roundTo) * options.roundTo;
  return Math.min(options.maxIterations, Math.max(options.minIterations, rounded));
}

async function deriveKekRaw(key: CryptoKey, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBytes(
  key: CryptoKey,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<KeyEnvelope> {
  const iv = randomBytes(12);
  const cipher = await subtle().encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
}

export async function decryptBytes(
  key: CryptoKey,
  envelope: KeyEnvelope,
): Promise<Uint8Array<ArrayBuffer>> {
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.data),
  );
  return new Uint8Array(plain);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<KeyEnvelope> {
  return encryptBytes(key, encoder.encode(JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, envelope: KeyEnvelope): Promise<T> {
  const bytes = await decryptBytes(key, envelope);
  return JSON.parse(decoder.decode(bytes)) as T;
}

export interface NewSecurityRecord {
  record: SecurityRecord;
  dek: CryptoKey;
}

export async function createSecurityRecord(
  pin: string,
  iterations?: number,
): Promise<NewSecurityRecord> {
  const salt = randomBytes(KDF.saltBytes);
  const effective = iterations ?? (await calibrateIterations());
  const kek = await deriveKek(pin, salt, effective);
  const rawDek = randomBytes(32);
  const dek = await subtle().importKey('raw', rawDek, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
  const wrappedDek = await encryptBytes(kek, rawDek);
  const kdf: KdfParams = { iterations: effective, salt: bytesToBase64(salt) };
  return { record: { version: 1, kdf, wrappedDek }, dek };
}

export async function unlockSecurityRecord(
  record: SecurityRecord,
  pin: string,
): Promise<CryptoKey | null> {
  const kdf = record.kdf;
  try {
    const kek = await deriveKek(pin, base64ToBytes(kdf.salt), kdf.iterations);
    const raw = await decryptBytes(kek, record.wrappedDek);
    return await subtle().importKey('raw', raw, { name: 'AES-GCM' }, true, [
      'encrypt',
      'decrypt',
    ]);
  } catch {
    return null;
  }
}

/** Re-wraps the in-memory DEK under a new PIN (fresh salt). */
export async function rewrapSecurityRecord(
  dek: CryptoKey,
  newPin: string,
  iterations?: number,
): Promise<SecurityRecord> {
  const salt = randomBytes(KDF.saltBytes);
  const effective = iterations ?? (await calibrateIterations());
  const kek = await deriveKek(newPin, salt, effective);
  const raw = new Uint8Array(await subtle().exportKey('raw', dek));
  const wrappedDek = await encryptBytes(kek, raw);
  return { version: 1, kdf: { iterations: effective, salt: bytesToBase64(salt) }, wrappedDek };
}

/** Password-based encryption for portable backups (independent of the PIN). */
export async function encryptWithPassword(value: unknown, password: string): Promise<{
  kdf: KdfParams;
  payload: KeyEnvelope;
}> {
  const salt = randomBytes(KDF.saltBytes);
  const iterations = APP_CONFIG.security.backup.iterations;
  const key = await deriveKek(password, salt, iterations);
  return {
    kdf: { iterations, salt: bytesToBase64(salt) },
    payload: await encryptJson(key, value),
  };
}

export async function decryptWithPassword<T>(
  payload: KeyEnvelope,
  password: string,
  kdf: KdfParams,
): Promise<T> {
  const key = await deriveKek(password, base64ToBytes(kdf.salt), kdf.iterations);
  return decryptJson<T>(key, payload);
}
