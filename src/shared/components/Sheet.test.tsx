import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from '@/shared/components/ui';

describe('Sheet', () => {
  it('closes on the backdrop and on Escape by default', () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Teste" onClose={onClose}>
        conteúdo
      </Sheet>,
    );

    const [backdrop] = screen.getAllByLabelText('close');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ignores the backdrop and Escape when persistent, and traps focus', () => {
    const onClose = vi.fn();
    render(
      <Sheet open persistent title="Teste" onClose={onClose}>
        <button type="button">Ação</button>
      </Sheet>,
    );

    expect(screen.queryByLabelText('close')).toBeNull();
    const dialog = screen.getByRole('dialog', { name: 'Teste' });
    const action = screen.getByText('Ação');
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(action);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(action);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
