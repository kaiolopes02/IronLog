export interface Capabilities {
  wakeLock: boolean;
  vibrate: boolean;
  notifications: boolean;
  serviceWorker: boolean;
  storagePersist: boolean;
  webAuthn: boolean;
  webAudio: boolean;
  webWorker: boolean;
  hardwareConcurrency: number;
  prefersReducedMotion: boolean;
}

function hasNotification(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function detectCapabilities(): Capabilities {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const win = typeof window === 'undefined' ? undefined : window;
  const reduced =
    typeof win !== 'undefined' && typeof win.matchMedia === 'function'
      ? win.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  return {
    wakeLock: !!nav && 'wakeLock' in nav,
    vibrate: !!nav && typeof nav.vibrate === 'function',
    notifications: hasNotification(),
    serviceWorker: !!nav && 'serviceWorker' in nav,
    storagePersist:
      !!nav && typeof nav.storage !== 'undefined' && typeof nav.storage.persist === 'function',
    webAuthn: typeof win !== 'undefined' && 'PublicKeyCredential' in win,
    webAudio: typeof win !== 'undefined' && 'AudioContext' in win,
    webWorker: typeof Worker !== 'undefined',
    hardwareConcurrency: nav?.hardwareConcurrency ?? 4,
    prefersReducedMotion: reduced,
  };
}

export function shouldAnimate(capabilities: Capabilities): boolean {
  return !capabilities.prefersReducedMotion && capabilities.hardwareConcurrency > 4;
}
