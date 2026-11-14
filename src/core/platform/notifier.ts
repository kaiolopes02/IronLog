type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let keepAlive: { oscillator: OscillatorNode; gain: GainNode } | null = null;
let armed: { endsAt: number; startAt: number; nodes: OscillatorNode[] } | null = null;
// Play receipt, deliberately kept across `cancelRestAlarm`: a remount (vault
// auto-lock) cancels the pending nodes and must still know the alarm sounded.
let lastArmed: { endsAt: number; startAt: number } | null = null;

function audioCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

function ensureContext(): AudioContext | null {
  if (context?.state === 'closed') context = null;
  if (context) {
    // WebKit reports "interrupted" (absent from the TS union) when another app
    // takes audio focus; anything not running must be resumed.
    if (context.state !== 'running') void context.resume().catch(() => undefined);
    return context;
  }
  const Ctor = audioCtor();
  if (!Ctor) return null;
  try {
    const next = new Ctor();
    next.addEventListener('statechange', () => {
      if (next.state !== 'running' && next.state !== 'closed') {
        void next.resume().catch(() => undefined);
      }
    });
    if (next.state !== 'running') void next.resume().catch(() => undefined);
    context = next;
  } catch {
    context = null;
  }
  return context;
}

/** Must be called from a user gesture once, so mobile browsers allow audio. */
export function primeAudio(): void {
  ensureContext();
}

/** Inaudible source that keeps the audio graph "playing" while backgrounded. */
function startKeepAlive(ctx: AudioContext): void {
  if (keepAlive) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  keepAlive = { oscillator, gain };
}

function stopKeepAlive(): void {
  if (!keepAlive) return;
  try {
    keepAlive.oscillator.stop();
  } catch {
    // already stopped
  }
  keepAlive.oscillator.disconnect();
  keepAlive.gain.disconnect();
  keepAlive = null;
}

const ALARM_BURSTS: ReadonlyArray<readonly [delay: number, duration: number, frequency: number]> = [
  [0, 0.16, 1046],
  [0.26, 0.16, 1568],
  [0.52, 0.16, 1046],
  [0.78, 0.16, 1568],
  [1.04, 0.16, 1046],
  [1.3, 0.35, 1568],
];

/** Full-scale square-wave alarm: piercing and loud. Bursts never overlap, so it cannot clip. */
function scheduleBursts(ctx: AudioContext, startAt: number): OscillatorNode[] {
  return ALARM_BURSTS.map(([delay, duration, frequency]) => {
    const at = startAt + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(1, at + 0.008);
    gain.gain.setValueAtTime(1, at + duration - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
    return oscillator;
  });
}

/** Arms the alarm on the audio clock so it fires at `endsAt` even if JS timers are frozen. */
export function scheduleRestAlarm(endsAt: number): boolean {
  cancelRestAlarm();
  const ctx = ensureContext();
  if (!ctx) return false;
  const delay = Math.max(0, (endsAt - Date.now()) / 1000);
  const startAt = ctx.currentTime + delay;
  startKeepAlive(ctx);
  try {
    armed = { endsAt, startAt, nodes: scheduleBursts(ctx, startAt) };
    lastArmed = { endsAt, startAt };
  } catch {
    stopKeepAlive();
    return false;
  }
  return ctx.state === 'running';
}

export function cancelRestAlarm(): void {
  if (armed) {
    for (const node of armed.nodes) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
      node.disconnect();
    }
    armed = null;
  }
  stopKeepAlive();
}

/** True when the alarm for this deadline was already rendered by the audio clock. */
export function restAlarmPlayed(endsAt: number): boolean {
  return (
    lastArmed?.endsAt === endsAt &&
    context !== null &&
    context.currentTime >= lastArmed.startAt - 0.02
  );
}

/** Plays the alarm now — used when the scheduled one could not sound. */
export function playRestBeep(): boolean {
  cancelRestAlarm();
  const ctx = ensureContext();
  if (!ctx) return false;
  try {
    scheduleBursts(ctx, ctx.currentTime + 0.01);
    return true;
  } catch {
    return false;
  }
}

export function vibrate(pattern: number | number[] = [200, 100, 200, 100, 400]): boolean {
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
    // Muted while visible (the audio alarm covers it), audible in the background,
    // where it is the only channel that survives on iOS.
    new Notification(title, {
      body,
      tag: 'ironlog-rest',
      silent: document.visibilityState === 'visible',
    });
    return true;
  } catch {
    return false;
  }
}
