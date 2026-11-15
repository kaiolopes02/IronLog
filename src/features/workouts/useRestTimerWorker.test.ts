import { act, renderHook } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRestTimerWorker } from '@/features/workouts/useRestTimerWorker';

class FakeWorker {
  static instances: FakeWorker[] = [];
  messages: unknown[] = [];
  terminated = false;
  private listeners: Array<(event: MessageEvent) => void> = [];

  constructor(_url: URL, _options?: WorkerOptions) {
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

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

describe('useRestTimerWorker', () => {
  it('schedules the deadline and forwards the matching completion', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const onFire = vi.fn();
    renderHook(() => useRestTimerWorker(5_000, onFire));

    const worker = FakeWorker.instances[0];
    expect(worker.messages).toEqual([{ endsAt: 5_000 }]);

    act(() => worker.emit({ endsAt: 5_000 }));
    expect(onFire).toHaveBeenCalledWith(5_000);
  });

  it('ignores a stale completion for another deadline', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const onFire = vi.fn();
    renderHook(() => useRestTimerWorker(5_000, onFire));

    FakeWorker.instances[0].emit({ endsAt: 4_000 });
    expect(onFire).not.toHaveBeenCalled();
  });

  it('re-arms a new worker when the deadline moves and stops the old one', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const onFire = vi.fn();
    const { rerender } = renderHook<void, { endsAt: number | null }>(
      ({ endsAt }: { endsAt: number | null }) => useRestTimerWorker(endsAt, onFire),
      { initialProps: { endsAt: 5_000 } },
    );

    rerender({ endsAt: 9_000 });
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(FakeWorker.instances[1].messages).toEqual([{ endsAt: 9_000 }]);

    rerender({ endsAt: null });
    expect(FakeWorker.instances[1].terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('does nothing when the browser blocks the worker', () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('blocked by CSP');
        }
      },
    );
    const onFire = vi.fn();
    expect(() => renderHook(() => useRestTimerWorker(5_000, onFire))).not.toThrow();
    expect(onFire).not.toHaveBeenCalled();
  });
});
