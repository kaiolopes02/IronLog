import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeOscillator {
  type = 'sine';
  frequency = new FakeParam();
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 100;
  // 'interrupted' is WebKit-only and absent from the TS AudioContextState union.
  state: 'running' | 'suspended' | 'interrupted' | 'closed' = 'running';
  destination = {};
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(() => Promise.resolve());
  addEventListener = vi.fn();

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
}

async function loadNotifier() {
  return import('@/core/platform/notifier');
}

function scheduledBursts(ctx: FakeAudioContext) {
  return ctx.oscillators.filter((oscillator) => oscillator.start.mock.calls[0]?.length === 1);
}

beforeEach(() => {
  vi.resetModules();
  FakeAudioContext.instances = [];
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'AudioContext');
  Reflect.deleteProperty(window, 'Notification');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('notifier', () => {
  it('schedules full-scale square bursts on the audio clock', async () => {
    const notifier = await loadNotifier();
    const endsAt = 1_000_000 + 5_000;

    expect(notifier.scheduleRestAlarm(endsAt)).toBe(true);

    const ctx = FakeAudioContext.instances[0];
    const bursts = scheduledBursts(ctx);
    expect(bursts.length).toBeGreaterThanOrEqual(3);
    for (const burst of bursts) expect(burst.type).toBe('square');

    const firstStart = bursts[0].start.mock.calls[0][0] as number;
    expect(firstStart).toBeGreaterThan(ctx.currentTime + 4.9);
    expect(firstStart).toBeLessThan(ctx.currentTime + 5.2);

    const peaks = ctx.gains.flatMap((gain) => gain.gain.linearRampToValueAtTime.mock.calls);
    expect(peaks.some(([value]) => value === 1)).toBe(true);
  });

  it('keeps the graph alive while armed, and the play receipt after a cancel', async () => {
    const notifier = await loadNotifier();
    const endsAt = 1_000_000 + 5_000;

    notifier.scheduleRestAlarm(endsAt);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.oscillators[0].start).toHaveBeenCalled(); // keep-alive
    expect(ctx.gains[0].gain.value).toBeCloseTo(0.0001);

    notifier.cancelRestAlarm();
    for (const oscillator of ctx.oscillators) expect(oscillator.stop).toHaveBeenCalled();

    // A remount (vault auto-lock) cancels the pending nodes; the receipt must
    // still report the alarm as already sounded so it is not replayed.
    ctx.currentTime += 5.1;
    expect(notifier.restAlarmPlayed(endsAt)).toBe(true);
  });

  it('drops the previous arm when a new deadline is scheduled', async () => {
    const notifier = await loadNotifier();

    notifier.scheduleRestAlarm(1_000_000 + 60_000);
    const ctx = FakeAudioContext.instances[0];
    const firstArm = [...ctx.oscillators];

    notifier.scheduleRestAlarm(1_000_000 + 75_000);
    for (const oscillator of firstArm) expect(oscillator.stop).toHaveBeenCalled();
    expect(notifier.restAlarmPlayed(1_000_000 + 60_000)).toBe(false);
    expect(ctx.oscillators.length).toBeGreaterThan(firstArm.length);
  });

  it('reports the alarm as played only after the audio clock reaches it', async () => {
    const notifier = await loadNotifier();
    const endsAt = 1_000_000 + 5_000;

    notifier.scheduleRestAlarm(endsAt);
    const ctx = FakeAudioContext.instances[0];
    expect(notifier.restAlarmPlayed(endsAt)).toBe(false);
    expect(notifier.restAlarmPlayed(endsAt + 1)).toBe(false);

    ctx.currentTime += 5.1;
    expect(notifier.restAlarmPlayed(endsAt)).toBe(true);

    // A frozen clock (suspended/interrupted context) never reaches the alarm.
    ctx.currentTime = 100;
    expect(notifier.restAlarmPlayed(endsAt)).toBe(false);
  });

  it('recovers an interrupted context and replaces a closed one', async () => {
    const notifier = await loadNotifier();

    notifier.primeAudio();
    const ctx = FakeAudioContext.instances[0];

    ctx.state = 'interrupted'; // WebKit audio-focus loss, e.g. an incoming call
    notifier.primeAudio();
    expect(ctx.resume).toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(1);

    ctx.state = 'closed';
    notifier.primeAudio();
    expect(FakeAudioContext.instances).toHaveLength(2);
    expect(FakeAudioContext.instances[1]).not.toBe(ctx);
  });

  it('plays the alarm immediately when scheduling is not possible', async () => {
    const notifier = await loadNotifier();

    expect(notifier.playRestBeep()).toBe(true);

    const ctx = FakeAudioContext.instances[0];
    const bursts = scheduledBursts(ctx);
    expect(bursts.length).toBeGreaterThanOrEqual(3);
    expect(bursts[0].start.mock.calls[0][0]).toBeCloseTo(ctx.currentTime + 0.01, 5);
  });

  it('uses the aggressive vibration fallback by default', async () => {
    const notifier = await loadNotifier();
    const vibrateSpy = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, configurable: true });

    expect(notifier.vibrate()).toBe(true);
    expect(vibrateSpy).toHaveBeenCalledWith([200, 100, 200, 100, 400]);

    Reflect.deleteProperty(navigator, 'vibrate');
  });

  it('lets the OS notification sound act as a background fallback', async () => {
    const notifier = await loadNotifier();
    const created: NotificationOptions[] = [];
    class FakeNotification {
      static permission = 'granted';
      constructor(_title: string, options: NotificationOptions) {
        created.push(options);
      }
    }
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

    expect(notifier.notify('Descanso', 'Acabou')).toBe(true);
    expect(created[0].silent).toBe(false);
  });
});
