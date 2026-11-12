// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createSecurityRecord,
  decryptWithPassword,
  encryptWithPassword,
  rewrapSecurityRecord,
  unlockSecurityRecord,
} from '@/core/crypto/keyring';

const ITERATIONS = 1_000;

describe('keyring', () => {
  it('creates a record that unlocks with the right PIN only', async () => {
    const { record, dek } = await createSecurityRecord('1234', ITERATIONS);
    expect(record.kdf.iterations).toBe(ITERATIONS);
    expect(dek.extractable).toBe(true);

    expect(await unlockSecurityRecord(record, '0000')).toBeNull();
    expect(await unlockSecurityRecord(record, '1234')).not.toBeNull();
  });

  it('re-wraps the same DEK under a new PIN', async () => {
    const { record, dek } = await createSecurityRecord('1234', ITERATIONS);
    const rewrapped = await rewrapSecurityRecord(dek, '5678', ITERATIONS);

    expect(await unlockSecurityRecord(record, '5678')).toBeNull();
    expect(await unlockSecurityRecord(rewrapped, '5678')).not.toBeNull();
    expect(await unlockSecurityRecord(rewrapped, '1234')).toBeNull();
  });

  it('encrypts and decrypts backups with a password', async () => {
    const payload = { hello: 'world', list: [1, 2, 3] };
    const encrypted = await encryptWithPassword(payload, 'hunter2');
    const decrypted = await decryptWithPassword<typeof payload>(
      encrypted.payload,
      'hunter2',
      encrypted.kdf,
    );
    expect(decrypted).toEqual(payload);
  });

  it('rejects the wrong backup password', async () => {
    const encrypted = await encryptWithPassword({ secret: true }, 'right');
    await expect(
      decryptWithPassword(encrypted.payload, 'wrong', encrypted.kdf),
    ).rejects.toThrow();
  });
});
