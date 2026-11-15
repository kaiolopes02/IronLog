import { useEffect, useRef } from 'preact/hooks';

/**
 * Calls `onFire` from a worker at the deadline, so hidden-tab timer throttling
 * cannot delay the notification. The page timer remains the fallback, and no
 * worker survives an OS process freeze.
 */
export function useRestTimerWorker(endsAt: number | null, onFire: (endsAt: number) => void): void {
  const fire = useRef(onFire);
  fire.current = onFire;

  useEffect(() => {
    if (endsAt === null || typeof Worker === 'undefined') return;
    let worker: Worker;
    try {
      worker = new Worker(new URL('./timer.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      return; // blocked by CSP or unsupported: the page timer still covers it
    }
    const onMessage = (event: MessageEvent<{ endsAt: number }>) => {
      if (event.data?.endsAt === endsAt) fire.current(endsAt);
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ endsAt });
    return () => {
      worker.removeEventListener('message', onMessage);
      worker.terminate();
    };
  }, [endsAt]);
}
