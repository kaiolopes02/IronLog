import { useEffect } from 'preact/hooks';
import { acquireWakeLock, type WakeLockHandle } from '@/core/platform/wake-lock';

/** Keeps the screen awake while a workout is open; degrades silently. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let handle: WakeLockHandle | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      handle = await acquireWakeLock(() => {
        handle = null;
      });
    };

    void acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !handle) void acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      handle?.release();
    };
  }, [active]);
}
