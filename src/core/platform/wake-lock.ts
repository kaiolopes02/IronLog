export interface WakeLockHandle {
  release(): void;
}

interface SentinelLike {
  release(): Promise<void>;
  released: boolean;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<SentinelLike>;
}

/**
 * Falls back silently: on iOS < 16.4 there is no Screen Wake Lock API, so the
 * screen may dim during rest. Re-acquisition happens on visibility change.
 */
export async function acquireWakeLock(onRelease?: () => void): Promise<WakeLockHandle | null> {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as unknown as { wakeLock?: WakeLockLike };
  if (!nav.wakeLock) return null;
  try {
    const sentinel = await nav.wakeLock.request('screen');
    sentinel.addEventListener('release', () => onRelease?.());
    return {
      release: () => {
        if (!sentinel.released) void sentinel.release();
      },
    };
  } catch {
    return null;
  }
}
