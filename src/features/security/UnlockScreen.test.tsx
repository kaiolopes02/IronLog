import { act, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/AppContext';
import type { AppServices } from '@/app/services';
import { setLocale } from '@/core/i18n';
import type { AppSettings, SecurityRecord } from '@/domain/entities';
import { UnlockScreen } from '@/features/security/UnlockScreen';

const SECURITY: SecurityRecord = {
  version: 1,
  kdf: { iterations: 1_000, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' },
  wrappedDek: { iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' },
};

function setup() {
  const unlock = vi.fn(async () => false);
  const setUnlocked = vi.fn();
  const services = {
    crypto: { unlock, lock: vi.fn(), isUnlocked: () => false },
  } as unknown as AppServices;

  render(
    <AppProvider
      value={{
        services,
        settings: {} as AppSettings,
        security: SECURITY,
        unlocked: false,
        updateSettings: async () => ({}) as AppSettings,
        saveSecurity: async () => undefined,
        setUnlocked,
      }}
    >
      <UnlockScreen />
    </AppProvider>,
  );

  return { unlock, setUnlocked };
}

beforeEach(() => setLocale('pt-BR'));
afterEach(() => vi.useRealTimers());

describe('unlock screen', () => {
  it('shows an error and clears the field on a wrong PIN', async () => {
    const { unlock } = setup();
    fireEvent.input(screen.getByLabelText('PIN'), { target: { value: '000000' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    });

    expect(unlock).toHaveBeenCalledWith(SECURITY, '000000');
    expect(screen.getByText('PIN incorreto.')).toBeTruthy();
    expect((screen.getByLabelText('PIN') as HTMLInputElement).value).toBe('');
  });

  it('waits before the third retry, then allows the next attempt', async () => {
    setup();
    vi.useFakeTimers();
    const input = screen.getByLabelText('PIN') as HTMLInputElement;
    const button = screen.getByRole('button', { name: 'Desbloquear' }) as HTMLButtonElement;

    const attempt = async () => {
      fireEvent.input(input, { target: { value: '000000' } });
      await act(async () => {
        fireEvent.click(button);
      });
    };

    await attempt();
    await attempt();
    expect(vi.getTimerCount()).toBe(0);

    const before = vi.getTimerCount();
    await attempt();
    expect(vi.getTimerCount()).toBe(before + 1);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(vi.getTimerCount()).toBe(before);
  });
});
