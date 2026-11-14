type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let keepAlive: { oscillator: OscillatorNode; gain: GainNode } | null = null;
let armed: { endsAt: number; startAt: number; nodes: OscillatorNode[] } | null = null;
// Play receipt, deliberately kept across `cancelRestAlarm`: a remount (vault
// auto-lock) cancels the pending nodes and must still know the alarm sounded.
let lastArmed: { endsAt: number; startAt: number } | null = null;

// iOS suspends Web Audio in the background, so there the alarm is pre-rendered
// into a WAV and played by a media element, whose pipeline keeps running
// without JS. 8 kHz/8-bit mono: ~0.5 MB per minute of rest.
const IOS_SAMPLE_RATE = 8000;
let media: HTMLAudioElement | null = null;
let mediaUnlocked = false;
let unlockUrl: string | null = null;
let trackUrl: string | null = null;
let mediaReceipt: { endsAt: number; delay: number } | null = null;
// Set when the catch-up beep already covered a deadline, so a remount cannot
// replay it when the blocked media track never moved.
let beepedFor: number | null = null;

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    // iPadOS 13+ in desktop mode claims to be a Mac; touch points give it away.
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

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

function startPlayback(element: HTMLAudioElement): void {
  void (async () => {
    try {
      await element.play();
    } catch {
      // Autoplay blocked: the catch-up beep and the popup still fire.
    }
  })();
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

const ALARM_SECONDS = Math.max(...ALARM_BURSTS.map(([delay, duration]) => delay + duration)) + 0.03;

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

/** The same six bursts as 8-bit unsigned PCM, for the iOS media track. */
function alarmPcm(): Uint8Array {
  const frames = Math.ceil(ALARM_SECONDS * IOS_SAMPLE_RATE);
  const samples = new Uint8Array(frames).fill(128);
  for (const [delay, duration, frequency] of ALARM_BURSTS) {
    const from = Math.round(delay * IOS_SAMPLE_RATE);
    const to = Math.min(frames, Math.round((delay + duration) * IOS_SAMPLE_RATE));
    for (let index = from; index < to; index += 1) {
      const local = index / IOS_SAMPLE_RATE - delay;
      const envelope = Math.max(0, Math.min(1, local / 0.008, (duration - local) / 0.03));
      const wave = Math.sin(2 * Math.PI * frequency * local) >= 0 ? 1 : -1;
      samples[index] = 128 + Math.round(wave * envelope * 127);
    }
  }
  return samples;
}

/** WAV of `silenceSec` of silence followed by the alarm. */
function wavUrl(silenceSec: number): string {
  const silence = new Uint8Array(Math.max(1, Math.round(silenceSec * IOS_SAMPLE_RATE))).fill(128);
  const alarm = alarmPcm();
  const data = new Uint8Array(silence.length + alarm.length);
  data.set(silence);
  data.set(alarm, silence.length);

  const header = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) header.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  header.setUint32(4, 36 + data.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, IOS_SAMPLE_RATE, true);
  header.setUint32(28, IOS_SAMPLE_RATE, true);
  header.setUint16(32, 1, true);
  header.setUint16(34, 8, true);
  ascii(36, 'data');
  header.setUint32(40, data.length, true);

  return URL.createObjectURL(new Blob([header.buffer, data], { type: 'audio/wav' }));
}

/** iOS only lets an element play after it has played once from a user gesture. */
function mediaElement(): HTMLAudioElement | null {
  if (media) return media;
  if (typeof Audio === 'undefined') return null;
  const element = new Audio();
  element.preload = 'auto';
  media = element;
  return element;
}

/** Retried on every gesture until iOS accepts one play(), since a blocked
 *  unlock would silence every later alarm for the session. */
function primeMedia(): void {
  if (mediaUnlocked || trackUrl) return; // already unlocked, or an alarm owns the element
  const element = mediaElement();
  if (!element) return;
  if (unlockUrl) URL.revokeObjectURL(unlockUrl);
  unlockUrl = wavUrl(0.05);
  element.src = unlockUrl;
  void (async () => {
    try {
      await element.play();
      mediaUnlocked = true;
    } catch {
      // Not credited as a gesture: the next set tap tries again.
    }
  })();
}

/** Must be called from a user gesture once, so mobile browsers allow audio. */
export function primeAudio(): void {
  ensureContext();
  // iOS only credits play() from a gesture: retry the unlock until it succeeds.
  if (isIOS()) primeMedia();
}

function armMedia(endsAt: number, delay: number): boolean {
  const element = mediaElement();
  if (!element) return false;
  try {
    if (trackUrl) URL.revokeObjectURL(trackUrl);
    if (unlockUrl) {
      URL.revokeObjectURL(unlockUrl);
      unlockUrl = null;
    }
    trackUrl = wavUrl(delay);
    element.src = trackUrl;
    startPlayback(element);
    mediaReceipt = { endsAt, delay };
    return true;
  } catch {
    return false;
  }
}

/** Arms the alarm on the audio clock so it fires at `endsAt` even if JS timers are frozen. */
export function scheduleRestAlarm(endsAt: number): boolean {
  cancelRestAlarm();
  const delay = Math.max(0, (endsAt - Date.now()) / 1000);
  if (isIOS()) return armMedia(endsAt, delay);
  const ctx = ensureContext();
  if (!ctx) return false;
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
  if (media && !media.paused) media.pause();
  if (trackUrl) {
    URL.revokeObjectURL(trackUrl);
    trackUrl = null;
  }
}

/** True when the alarm for this deadline was already rendered. */
export function restAlarmPlayed(endsAt: number): boolean {
  if (beepedFor === endsAt) return true;
  if (mediaReceipt) {
    return (
      mediaReceipt.endsAt === endsAt &&
      media !== null &&
      // Tolerance covers the media pipeline's start-up delay, without turning
      // a very short rest into an instant "played".
      media.currentTime >= Math.max(0.05, mediaReceipt.delay - 0.5)
    );
  }
  return (
    lastArmed?.endsAt === endsAt &&
    context !== null &&
    context.currentTime >= lastArmed.startAt - 0.02
  );
}

/** Plays the alarm now — used when the scheduled one could not sound. */
export function playRestBeep(endsAt: number): boolean {
  cancelRestAlarm();
  const ctx = ensureContext();
  if (!ctx) return false;
  try {
    scheduleBursts(ctx, ctx.currentTime + 0.01);
    beepedFor = endsAt;
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
