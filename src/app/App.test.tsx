import { render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import type { BootResult } from '@/app/services';
import { APP_CONFIG } from '@/core/config/app.config';
import { detectCapabilities } from '@/core/config/capabilities';
import { createCryptoService } from '@/core/crypto/crypto.client';
import { IronLogDb } from '@/core/database/db';
import { createRepositories, seedDatabase } from '@/core/database/repositories';
import { setLocale } from '@/core/i18n';

let db: IronLogDb;
let bootResult: BootResult;

beforeEach(async () => {
  db = new IronLogDb(`ironlog-app-${Math.random().toString(36).slice(2)}`);
  await seedDatabase(db);
  const repos = createRepositories(db);
  const settings = {
    ...(await repos.settings.get()),
    locale: 'pt-BR' as const,
    consentVersion: APP_CONFIG.consentVersion,
  };
  await repos.settings.patch(settings);
  setLocale('pt-BR');
  bootResult = {
    services: {
      db,
      repos,
      crypto: createCryptoService(),
      capabilities: detectCapabilities(),
    },
    settings,
    security: null,
    activeSessionId: null,
    needsConsent: false,
  };
});

afterEach(async () => {
  await db.delete();
});

describe('app shell', () => {
  it('boots into the home screen with the seeded catalog', async () => {
    render(<App bootResult={bootResult} />);
    await waitFor(() => {
      expect(screen.getByText('Bora treinar')).toBeTruthy();
    });
    expect(screen.getByText('Iniciar treino')).toBeTruthy();
  });

  it('shows the consent screen until it is accepted', async () => {
    render(
      <App
        bootResult={{
          ...bootResult,
          settings: { ...bootResult.settings, consentVersion: null },
          needsConsent: true,
        }}
      />,
    );
    expect(screen.getByText('Bem-vindo ao IronLog')).toBeTruthy();
  });
});
