import type { KeyEnvelope, SecurityRecord } from '@/domain/entities';
import type { CryptoRequest, CryptoResponse } from '@/core/crypto/crypto.protocol';
import {
  createSecurityRecord,
  decryptJson,
  encryptJson,
  rewrapSecurityRecord,
  unlockSecurityRecord,
} from '@/core/crypto/keyring';

interface WorkerScope {
  onmessage: ((event: MessageEvent<CryptoRequest>) => void) | null;
  postMessage(message: CryptoResponse): void;
}

const scope = self as unknown as WorkerScope;

let dek: CryptoKey | null = null;
let record: SecurityRecord | null = null;

function reply(id: number, partial: Omit<CryptoResponse, 'id' | 'ok'>): void {
  scope.postMessage({ id, ok: true, ...partial });
}

function fail(id: number, error: string): void {
  scope.postMessage({ id, ok: false, error });
}

function requireKey(): CryptoKey {
  if (!dek) throw new Error('locked');
  return dek;
}

scope.onmessage = (event) => {
  const request = event.data;
  void (async () => {
    try {
      switch (request.op) {
        case 'create': {
          const created = await createSecurityRecord(request.pin ?? '', request.iterations);
          record = created.record;
          dek = created.dek;
          reply(request.id, { record: created.record, unlocked: true });
          break;
        }
        case 'unlock': {
          if (!request.record) throw new Error('missing record');
          const key = await unlockSecurityRecord(request.record, request.pin ?? '');
          if (!key) {
            dek = null;
            reply(request.id, { unlocked: false });
            break;
          }
          dek = key;
          record = request.record;
          reply(request.id, { unlocked: true });
          break;
        }
        case 'lock':
          dek = null;
          reply(request.id, { unlocked: false });
          break;
        case 'encrypt':
          reply(request.id, { envelope: await encryptJson(requireKey(), request.value) });
          break;
        case 'decrypt':
          reply(request.id, { value: await decryptJson(requireKey(), request.envelope as KeyEnvelope) });
          break;
        case 'rewrap': {
          if (!record) throw new Error('missing record');
          const next = await rewrapSecurityRecord(requireKey(), request.pin ?? '', request.iterations);
          record = next;
          reply(request.id, { record: next, unlocked: true });
          break;
        }
        case 'status':
          reply(request.id, { unlocked: dek !== null });
          break;
        default:
          fail(request.id, `unknown op: ${String(request.op)}`);
      }
    } catch (error) {
      fail(request.id, error instanceof Error ? error.message : 'crypto error');
    }
  })();
};
