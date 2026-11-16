import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/AppContext';
import { detectCapabilities } from '@/core/config/capabilities';
import { createCryptoService } from '@/core/crypto/crypto.client';
import { IronLogDb } from '@/core/database/db';
import { createRepositories, seedDatabase } from '@/core/database/repositories';
import { setLocale } from '@/core/i18n';
import {
  cancelRestAlarm,
  notify,
  scheduleRestAlarm,
  vibrate,
} from '@/core/platform/notifier';
import { RestAlert } from '@/features/workouts/RestAlert';
import { skipRest } from '@/features/workouts/session-actions';
import type { AppSettings, WorkoutSession } from '@/domain/entities';

vi.mock('@/core/platform/notifier', () => ({
  notify: vi.fn(() => true),
  vibrate: vi.fn(() => true),
  scheduleRestAlarm: vi.fn(() => true),
  cancelRestAlarm: vi.fn(),
  requestNotificationPermission: vi.fn(async () => false),
}));

let db: IronLogDb;

class FakeWorker {
  static instances: FakeWorker[] = [];
  messages: unknown[] = [];
  terminated = false;
  private listeners: Array<(event: MessageEvent) => void> = [];

  constructor(readonly url: URL, _options?: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    if (type === 'message') this.listeners.push(listener as (event: MessageEvent) => void);
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (type === 'message') this.listeners = this.listeners.filter((item) => item !== listener);
  }

  postMessage(data: unknown): void {
    this.messages.push(data);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(data: unknown): void {
    for (const listener of [...this.listeners]) listener({ data } as MessageEvent);
  }
}

async function setup(endsAt: number): Promise<void> {
  db = new IronLogDb(`ironlog-rest-${Math.random().toString(36).slice(2)}`);
  await seedDatabase(db);
  const repos = createRepositories(db);
  const settings: AppSettings = await repos.settings.patch({
    locale: 'pt-BR',
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
    timer: { durationSec: 90, endsAt, exerciseId: 'bb-bench' },
    updatedAt: Date.now(),
    noteRef: null,
  };
  await repos.sessions.put(session);

  render(
    <AppProvider
      value={{
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
      }}
    >
      <RestAlert />
    </AppProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(scheduleRestAlarm).mockReturnValue(true);
});

afterEach(async () => {
  if (db) await db.delete();
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

describe('RestAlert', () => {
  it('shows a persistent alert that only the action button dismisses', async () => {
    await setup(Date.now() - 1_000);
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
    await setup(Date.now() - 1_000);
    await screen.findByText('Descanso acabou');
    expect(scheduleRestAlarm).not.toHaveBeenCalled(); // already expired: no arming
    await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledTimes(1);

    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event('focus'));

    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('arms the OS alarm and re-arms when the timer moves', async () => {
    const endsAt = Date.now() + 60_000;
    await setup(endsAt);
    await waitFor(() => expect(scheduleRestAlarm).toHaveBeenCalledWith(endsAt));

    const repos = createRepositories(db);
    const current = await repos.sessions.get('ses-rest');
    if (!current) throw new Error('session missing');
    const extended = endsAt + 15_000;

    vi.mocked(cancelRestAlarm).mockClear();
    await repos.sessions.put({
      ...current,
      timer: { durationSec: 75, endsAt: extended, exerciseId: 'bb-bench' },
    });
    await waitFor(() => expect(scheduleRestAlarm).toHaveBeenCalledWith(extended));
    expect(vi.mocked(scheduleRestAlarm).mock.lastCall?.[0]).toBe(extended);
    expect(cancelRestAlarm).not.toHaveBeenCalled(); // the arm is replaced, not dropped

    const extendedSession = await repos.sessions.get('ses-rest');
    if (!extendedSession) throw new Error('session missing');
    await skipRest(repos, extendedSession);
    await waitFor(() => expect(cancelRestAlarm).toHaveBeenCalled());
  });

  it('alerts from the worker before the page tick, once per deadline', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const endsAt = Date.now() + 300;
    await setup(endsAt);
    await waitFor(() => expect(scheduleRestAlarm).toHaveBeenCalledWith(endsAt));

    // The crypto service spins up its own worker first; pick the timer one.
    const worker = FakeWorker.instances.find((item) => String(item.url).includes('timer.worker'));
    expect(worker).toBeDefined();
    await waitFor(() => expect(worker?.messages).toEqual([{ endsAt }]));

    act(() => worker!.emit({ endsAt }));
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);

    // The page tick reaches the same deadline afterwards: still one alert.
    await screen.findByText('Descanso acabou', undefined, { timeout: 3_000 });
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

