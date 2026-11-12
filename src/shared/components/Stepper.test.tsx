import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from '@/shared/components/Stepper';

describe('Stepper', () => {
  it('increments and decrements by the step', () => {
    const onChange = vi.fn();
    render(<Stepper label="Carga" value={100} step={2.5} onChange={onChange} suffix="kg" />);

    fireEvent.click(screen.getByLabelText('Carga +'));
    expect(onChange).toHaveBeenCalledWith(102.5);

    fireEvent.click(screen.getByLabelText('Carga -'));
    expect(onChange).toHaveBeenCalledWith(97.5);
  });

  it('clamps values to the configured range', () => {
    const onChange = vi.fn();
    render(<Stepper label="Reps" value={1} step={1} min={1} max={3} onChange={onChange} />);
    expect((screen.getByLabelText('Reps -') as HTMLButtonElement).disabled).toBe(true);
  });

  it('commits typed values on blur', () => {
    const onChange = vi.fn();
    render(<Stepper label="Carga" value={10} step={1} onChange={onChange} />);
    const input = screen.getByLabelText('Carga') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '12,5' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(12.5);
  });
});
