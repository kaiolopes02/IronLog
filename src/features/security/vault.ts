import { useCallback } from 'preact/hooks';
import { useApp } from '@/app/AppContext';
import { newId } from '@/shared/utils/id';

export interface Vault {
  available: boolean;
  put: (target: string, value: unknown) => Promise<string>;
  get: <T>(id: string | null) => Promise<T | null>;
  remove: (id: string | null) => Promise<void>;
}

/**
 * Notes are encrypted with the in-memory DEK. Without a PIN there is no key,
 * so the UI hides the field instead of pretending to encrypt it.
 */
export function useVault(): Vault {
  const { services, settings, unlocked } = useApp();
  const available = settings.securityEnabled && unlocked && services.crypto.isUnlocked();

  const put = useCallback(
    async (target: string, value: unknown) => {
      const id = newId('vault');
      const payload = await services.crypto.encrypt(value);
      await services.repos.vault.put({ id, target, updatedAt: Date.now(), payload });
      return id;
    },
    [services.crypto, services.repos.vault],
  );

  const get = useCallback(
    async <T,>(id: string | null): Promise<T | null> => {
      if (!id) return null;
      const record = await services.repos.vault.get(id);
      if (!record) return null;
      try {
        return await services.crypto.decrypt<T>(record.payload);
      } catch {
        return null;
      }
    },
    [services.crypto, services.repos.vault],
  );

  const remove = useCallback(
    async (id: string | null) => {
      if (id) await services.repos.vault.remove(id);
    },
    [services.repos.vault],
  );

  return { available, put, get, remove };
}
