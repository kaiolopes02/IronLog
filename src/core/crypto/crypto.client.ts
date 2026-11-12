import CryptoWorker from '@/core/crypto/crypto.worker?worker';
import type { KeyEnvelope, SecurityRecord } from '@/domain/entities';
import type { CryptoRequest, CryptoResponse } from '@/core/crypto/crypto.protocol';
import {
  createSecurityRecord,
  decryptJson,
  encryptJson,
  rewrapSecurityRecord,
  unlockSecurityRecord,
} from '@/core/crypto/keyring';

/**
 * The DEK never leaves the crypto context. Two implementations share the same
 * contract: a dedicated Web Worker (default) and an in-page fallback for
 * browsers where worker creation fails.
 */
export interface CryptoService {
  readonly mode: 'worker' | 'local';
  create(pin: string): Promise<SecurityRecord>;
  unlock(record: SecurityRecord, pin: string): Promise<boolean>;
  lock(): void;
  isUnlocked(): boolean;
  encrypt(value: unknown): Promise<KeyEnvelope>;
  decrypt<T>(envelope: KeyEnvelope): Promise<T>;
  rewrap(pin: string): Promise<SecurityRecord>;
}

interface WorkerLike {
  postMessage(message: CryptoRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<CryptoResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

class WorkerCryptoService implements CryptoService {
  readonly mode = 'worker' as const;
  private seq = 0;
  private unlocked = false;
  private readonly pending = new Map<
    number,
    { resolve: (response: CryptoResponse) => void; reject: (error: Error) => void }
  >();

  constructor(private readonly worker: WorkerLike) {
    worker.onmessage = (event) => {
      const response = event.data;
      const entry = this.pending.get(response.id);
      if (!entry) return;
      this.pending.delete(response.id);
      if (response.ok) entry.resolve(response);
      else entry.reject(new Error(response.error ?? 'crypto error'));
    };
    worker.onerror = () => {
      for (const entry of this.pending.values()) entry.reject(new Error('worker error'));
      this.pending.clear();
    };
  }

  private call(request: Omit<CryptoRequest, 'id'>): Promise<CryptoResponse> {
    const id = ++this.seq;
    return new Promise<CryptoResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...request, id });
    });
  }

  async create(pin: string): Promise<SecurityRecord> {
    const response = await this.call({ op: 'create', pin });
    if (!response.record) throw new Error('create failed');
    this.unlocked = true;
    return response.record;
  }
  async unlock(record: SecurityRecord, pin: string): Promise<boolean> {
    const response = await this.call({ op: 'unlock', record, pin });
    this.unlocked = response.unlocked === true;
    return this.unlocked;
  }
  lock(): void {
    this.unlocked = false;
    void this.call({ op: 'lock' });
  }
  isUnlocked(): boolean {
    return this.unlocked;
  }
  async encrypt(value: unknown): Promise<KeyEnvelope> {
    const response = await this.call({ op: 'encrypt', value });
    if (!response.envelope) throw new Error('encrypt failed');
    return response.envelope;
  }
  async decrypt<T>(envelope: KeyEnvelope): Promise<T> {
    const response = await this.call({ op: 'decrypt', envelope });
    return response.value as T;
  }
  async rewrap(pin: string): Promise<SecurityRecord> {
    const response = await this.call({ op: 'rewrap', pin });
    if (!response.record) throw new Error('rewrap failed');
    this.unlocked = true;
    return response.record;
  }
}

class LocalCryptoService implements CryptoService {
  readonly mode = 'local' as const;
  private dek: CryptoKey | null = null;

  async create(pin: string): Promise<SecurityRecord> {
    const created = await createSecurityRecord(pin);
    this.dek = created.dek;
    return created.record;
  }
  async unlock(record: SecurityRecord, pin: string): Promise<boolean> {
    const key = await unlockSecurityRecord(record, pin);
    if (!key) return false;
    this.dek = key;
    return true;
  }
  lock(): void {
    this.dek = null;
  }
  isUnlocked(): boolean {
    return this.dek !== null;
  }
  async encrypt(value: unknown): Promise<KeyEnvelope> {
    if (!this.dek) throw new Error('locked');
    return encryptJson(this.dek, value);
  }
  async decrypt<T>(envelope: KeyEnvelope): Promise<T> {
    if (!this.dek) throw new Error('locked');
    return decryptJson<T>(this.dek, envelope);
  }
  async rewrap(pin: string): Promise<SecurityRecord> {
    if (!this.dek) throw new Error('locked');
    return rewrapSecurityRecord(this.dek, pin);
  }
}

export function createCryptoService(): CryptoService {
  if (typeof Worker === 'undefined') return new LocalCryptoService();
  try {
    return new WorkerCryptoService(new CryptoWorker() as unknown as WorkerLike);
  } catch {
    return new LocalCryptoService();
  }
}
