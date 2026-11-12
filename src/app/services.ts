import { APP_CONFIG } from '@/core/config/app.config';
import { detectCapabilities, type Capabilities } from '@/core/config/capabilities';
import { createCryptoService, type CryptoService } from '@/core/crypto/crypto.client';
import { IronLogDb } from '@/core/database/db';
import { createRepositories, seedDatabase } from '@/core/database/repositories';
import { setLocale } from '@/core/i18n';
import type { AppSettings, SecurityRecord } from '@/domain/entities';
import type { Repositories } from '@/domain/ports/repositories';
import { seedCatalog, validateSeed } from '@/seed';

export interface AppServices {
  db: IronLogDb;
  repos: Repositories;
  crypto: CryptoService;
  capabilities: Capabilities;
}

export interface BootResult {
  services: AppServices;
  settings: AppSettings;
  security: SecurityRecord | null;
  activeSessionId: string | null;
  needsConsent: boolean;
}

export async function boot(): Promise<BootResult> {
  const problems = validateSeed(seedCatalog);
  if (problems.length > 0) console.error('seed integrity problems', problems);

  const db = new IronLogDb();
  await seedDatabase(db);
  const repos = createRepositories(db);
  const settings = await repos.settings.get();
  setLocale(settings.locale);

  const security = (await repos.security.get()) ?? null;
  const active = await repos.sessions.findActive();

  return {
    services: {
      db,
      repos,
      crypto: createCryptoService(),
      capabilities: detectCapabilities(),
    },
    settings,
    security,
    activeSessionId: active?.id ?? null,
    needsConsent: settings.consentVersion !== APP_CONFIG.consentVersion,
  };
}
