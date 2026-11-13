import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from '@/shared/components/Stepper';

describe('Stepper', () => {
  it('increments and decrements by the step', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Stepper label="Carga" value={100} step={2.5} onChange={onChange} suffix="kg" />,
    );

    fireEvent.click(screen.getByLabelText('Carga +'));
    expect(onChange).toHaveBeenCalledWith(102.5);

    rerender(<Stepper label="Carga" value={102.5} step={2.5} onChange={onChange} suffix="kg" />);
    fireEvent.click(screen.getByLabelText('Carga -'));
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('bumps from the value just typed, not the delayed prop', () => {
    const onChange = vi.fn();
    render(<Stepper label="Carga" value={100} step={2.5} onChange={onChange} />);
    const input = screen.getByLabelText('Carga') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: '120' } });
    fireEvent.click(screen.getByLabelText('Carga +'));

    expect(onChange).toHaveBeenLastCalledWith(122.5);
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

  it('propagates in-range values while typing, before blur', () => {
    const onChange = vi.fn();
    render(<Stepper label="Carga" value={1} step={1} min={1} max={999} onChange={onChange} />);
    const input = screen.getByLabelText('Carga') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '999' } });
    expect(onChange).toHaveBeenCalledWith(999);
    expect(input.value).toBe('999');
  });

  it('ignores out-of-range keystrokes so the text is not rewritten', () => {
    const onChange = vi.fn();
    render(<Stepper label="Carga" value={15} step={1} min={15} max={999} onChange={onChange} />);
    const input = screen.getByLabelText('Carga') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '1' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('1');
  });

  it('keeps a trailing separator while the committed value catches up', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Stepper label="Carga" value={10} step={1} onChange={onChange} />,
    );
    const input = screen.getByLabelText('Carga') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: '12,' } });
    rerender(<Stepper label="Carga" value={12} step={1} onChange={onChange} />);
    expect(input.value).toBe('12,');
  });

  it('does not let a late value echo reformat text being edited', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Stepper label="Carga" value={0} step={0.5} onChange={onChange} />,
    );
    const input = screen.getByLabelText('Carga') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: '102.5' } });
    expect(onChange).toHaveBeenCalledWith(102.5);
    rerender(<Stepper label="Carga" value={102.5} step={0.5} onChange={onChange} />);
    expect(input.value).toBe('102.5');
  });

  it('moves the suffix out of the input row into the label', () => {
    render(<Stepper label="Carga" value={100} step={2.5} onChange={() => undefined} suffix="kg" />);
    expect(screen.getByText('Carga · kg')).toBeTruthy();
  });
});
