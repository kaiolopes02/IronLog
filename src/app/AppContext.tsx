import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { AppServices } from '@/app/services';
import type { AppSettings, SecurityRecord } from '@/domain/entities';

export interface AppContextValue {
  services: AppServices;
  settings: AppSettings;
  security: SecurityRecord | null;
  unlocked: boolean;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  saveSecurity: (record: SecurityRecord | null) => Promise<void>;
  setUnlocked: (value: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider = AppContext.Provider;

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('AppProvider missing');
  return value;
}
