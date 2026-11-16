import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkExactAlarmPermission, requestExactAlarmPermission } from '@/core/platform/notifier';
import { ExactAlarmPrompt } from '@/features/workouts/ExactAlarmPrompt';

vi.mock('@/core/platform/notifier', () => ({
  checkExactAlarmPermission: vi.fn(async () => true),
  requestExactAlarmPermission: vi.fn(async () => true),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkExactAlarmPermission).mockResolvedValue(true);
  vi.mocked(requestExactAlarmPermission).mockResolvedValue(false);
});

describe('ExactAlarmPrompt', () => {
  it('stays hidden when the check answers granted, as it always does off Android', async () => {
    render(<ExactAlarmPrompt />);

    await waitFor(() => expect(checkExactAlarmPermission).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('explains the delay and opens the Android screen that grants the permission', async () => {
    vi.mocked(checkExactAlarmPermission).mockResolvedValue(false);
    render(<ExactAlarmPrompt />);

    expect(await screen.findByText('Permitir alarmes exatos')).not.toBeNull();
    expect(screen.getByText(/atrasa a notificação do descanso/)).not.toBeNull();

    fireEvent.click(screen.getByText('Abrir definições'));

    expect(requestExactAlarmPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
