import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/AppContext';
import { detectCapabilities } from '@/core/config/capabilities';
import { createCryptoService } from '@/core/crypto/crypto.client';
import { IronLogDb } from '@/core/database/db';
import { createRepositories, seedDatabase } from '@/core/database/repositories';
import { setLocale } from '@/core/i18n';
import { notify, playRestBeep, vibrate } from '@/core/platform/notifier';
import { RestAlert } from '@/features/workouts/RestAlert';
import type { AppSettings, WorkoutSession } from '@/domain/entities';

vi.mock('@/core/platform/notifier', () => ({
  notify: vi.fn(),
  playRestBeep: vi.fn(),
  vibrate: vi.fn(),
  primeAudio: vi.fn(),
  requestNotificationPermission: vi.fn(async () => false),
}));

let db: IronLogDb;
let settings: AppSettings;

beforeEach(async () => {
  vi.clearAllMocks();
  db = new IronLogDb(`ironlog-rest-${Math.random().toString(36).slice(2)}`);
  await seedDatabase(db);
  const repos = createRepositories(db);
  settings = await repos.settings.patch({
    locale: 'pt-BR',
    timerSound: true,
    timerVibration: true,
    timerNotifications: true,
  });
  setLocale('pt-BR');

  const session: WorkoutSession = {
    id: 'ses-rest',
    routineId: null,
    dayId: null,
    name: 'Treino',
    exerciseIds: ['bb-bench'],
    startedAt: Date.now() - 60_000,
    finishedAt: null,
    status: 'active',
    timer: { durationSec: 90, endsAt: Date.now() - 1_000, exerciseId: 'bb-bench' },
    updatedAt: Date.now(),
    noteRef: null,
  };
  await repos.sessions.put(session);

  const value = {
    services: {
      db,
      repos,
      crypto: createCryptoService(),
      capabilities: detectCapabilities(),
    },
    settings,
    security: null,
    unlocked: true,
    updateSettings: (patch: Partial<AppSettings>) => repos.settings.patch(patch),
    saveSecurity: async () => undefined,
    setUnlocked: () => undefined,
  };
  render(
    <AppProvider value={value}>
      <RestAlert />
    </AppProvider>,
  );
});

afterEach(async () => {
  await db.delete();
});

describe('RestAlert', () => {
  it('shows a persistent alert that only the action button dismisses', async () => {
    await screen.findByText('Descanso acabou');
    expect(screen.queryByLabelText('close')).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event('blur'));
    expect(screen.queryByText('Descanso acabou')).not.toBeNull();

    fireEvent.click(screen.getByText('Voltar ao treino'));

    await waitFor(() => {
      expect(screen.queryByText('Descanso acabou')).toBeNull();
    });
    const stored = await createRepositories(db).sessions.get('ses-rest');
    expect(stored?.timer).toBeNull();
  });

  it('alerts once, even across visibility and focus events', async () => {
    await screen.findByText('Descanso acabou');
    await waitFor(() => expect(playRestBeep).toHaveBeenCalledTimes(1));
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);

    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event('focus'));

    expect(playRestBeep).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
