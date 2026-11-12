import type { KeyEnvelope, SecurityRecord } from '@/domain/entities';

export type CryptoOp =
  | 'create'
  | 'unlock'
  | 'lock'
  | 'encrypt'
  | 'decrypt'
  | 'rewrap'
  | 'status';

export interface CryptoRequest {
  id: number;
  op: CryptoOp;
  pin?: string;
  record?: SecurityRecord;
  iterations?: number;
  value?: unknown;
  envelope?: KeyEnvelope;
}

export interface CryptoResponse {
  id: number;
  ok: boolean;
  error?: string;
  record?: SecurityRecord;
  envelope?: KeyEnvelope;
  value?: unknown;
  unlocked?: boolean;
}
