type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;

function audioCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

/** Must be called from a user gesture once, so mobile browsers allow audio. */
export function primeAudio(): void {
  if (context) {
    if (context.state === 'suspended') void context.resume();
    return;
  }
  const Ctor = audioCtor();
  if (!Ctor) return;
  try {
    context = new Ctor();
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = null;
  }
}

/** Synthesised beep — no audio files, no network. */
export function playRestBeep(pattern: 'single' | 'triple' = 'triple'): boolean {
  primeAudio();
  if (!context) return false;
  const start = context.currentTime + 0.01;
  const bursts = pattern === 'triple' ? [0, 0.22, 0.44] : [0];
  for (const offset of bursts) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.18);
  }
  return true;
}

export function vibrate(pattern: number | number[] = [120, 60, 120]): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  return navigator.vibrate(pattern);
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

/** Local notification only; the page must stay same-origin. */
export function notify(title: string, body: string): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    new Notification(title, { body, tag: 'ironlog-rest', silent: true });
    return true;
  } catch {
    return false;
  }
}
