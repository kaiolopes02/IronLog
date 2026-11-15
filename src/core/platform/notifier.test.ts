import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Unmocked Capacitor resolves to the web implementation in jsdom; the save
// button on Android is a plugin call, so it has to be faked to be observable.
const plugin = vi.hoisted(() => ({
  isNative: false,
  schedule: vi.fn(),
  cancel: vi.fn(),
  createChannel: vi.fn(),
  checkExact: vi.fn(),
  changeExact: vi.fn(),
  requestPermissions: vi.fn(),
  haptics: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => plugin.isNative },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    createChannel: plugin.createChannel,
    checkExactNotificationSetting: plugin.checkExact,
    changeExactNotificationSetting: plugin.changeExact,
    requestPermissions: plugin.requestPermissions,
    schedule: plugin.schedule,
    cancel: plugin.cancel,
  },
}));

vi.mock('@capacitor/haptics', () => ({ Haptics: { vibrate: plugin.haptics } }));

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

class FakeAudio {
  static instances: FakeAudio[] = [];
  static rejectPlay = false;
  src = '';
  preload = '';
  paused = true;
  currentTime = 0;
  play = vi.fn(() => {
    if (FakeAudio.rejectPlay) return Promise.reject(new Error('blocked'));
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });

  constructor() {
    FakeAudio.instances.push(this);
  }
}

async function loadNotifier() {
  return import('@/core/platform/notifier');
}

function scheduledBursts(ctx: FakeAudioContext) {
  return ctx.oscillators.filter((oscillator) => oscillator.start.mock.calls[0]?.length === 1);
}

function useIOSUserAgent() {
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    configurable: true,
  });
}

function useAndroidUserAgent() {
  Object.defineProperty(navigator, 'userAgent', {
    value:
      'Mozilla/5.0 (Linux; Android 11; Pixel 4) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/95.0.4638.74 Mobile Safari/537.36',
    configurable: true,
  });
}

beforeEach(() => {
  vi.resetModules();
  plugin.isNative = false;
  plugin.schedule.mockReset().mockResolvedValue({});
  plugin.cancel.mockReset().mockResolvedValue(undefined);
  plugin.createChannel.mockReset().mockResolvedValue(undefined);
  plugin.checkExact.mockReset().mockResolvedValue({ exact_alarm: 'granted' });
  plugin.changeExact.mockReset().mockResolvedValue({ exact_alarm: 'granted' });
  plugin.requestPermissions.mockReset().mockResolvedValue({ display: 'granted' });
  plugin.haptics.mockReset().mockResolvedValue(undefined);
  FakeAudioContext.instances = [];
  FakeAudio.instances = [];
  FakeAudio.rejectPlay = false;
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  vi.stubGlobal('Audio', FakeAudio);
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:alarm'),
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'AudioContext');
  Reflect.deleteProperty(window, 'Notification');
  Reflect.deleteProperty(navigator, 'userAgent');
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
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

    expect(notifier.playRestBeep(123)).toBe(true);
    expect(notifier.restAlarmPlayed(123)).toBe(true); // the beep is the receipt

    const ctx = FakeAudioContext.instances[0];
    const bursts = scheduledBursts(ctx);
    expect(bursts.length).toBeGreaterThanOrEqual(3);
    expect(bursts[0].start.mock.calls[0][0]).toBeCloseTo(ctx.currentTime + 0.01, 5);
  });

  it('uses the short vibration pattern by default and never throws', async () => {
    const notifier = await loadNotifier();
    const vibrateSpy = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, configurable: true });

    expect(notifier.vibrate()).toBe(true);
    expect(vibrateSpy).toHaveBeenCalledWith([300, 150, 300]);

    vibrateSpy.mockImplementation(() => {
      throw new Error('unsupported');
    });
    expect(notifier.vibrate()).toBe(false);

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

  it('shows the system notification through the service worker on Android', async () => {
    const notifier = await loadNotifier();
    const showNotification = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: async () => ({ showNotification }) },
      configurable: true,
    });
    class FakeNotification {
      static permission = 'granted';
      constructor() {
        throw new Error('new Notification is illegal on Android Chrome');
      }
    }
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

    expect(notifier.notify('Descanso', 'Acabou')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(showNotification).toHaveBeenCalledWith(
      'Descanso',
      expect.objectContaining({ tag: 'ironlog-rest', silent: false, vibrate: [300, 150, 300] }),
    );
  });

  it('falls back to a direct notification when the worker cannot show one', async () => {
    const notifier = await loadNotifier();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: async () => ({
          showNotification: vi.fn(() => Promise.reject(new Error('no'))),
        }),
      },
      configurable: true,
    });
    const created: NotificationOptions[] = [];
    class FakeNotification {
      static permission = 'granted';
      constructor(_title: string, options: NotificationOptions) {
        created.push(options);
      }
    }
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;

    expect(notifier.notify('Descanso', 'Acabou')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(created).toHaveLength(1);
  });

  it('falls back to a direct notification when no service worker is active', async () => {
    const notifier = await loadNotifier();
    // Chrome Android leaves `serviceWorker.ready` pending forever here.
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: async () => undefined },
      configurable: true,
    });
    const created: NotificationOptions[] = [];
    class FakeNotification {
      static permission = 'granted';
      constructor(_title: string, options: NotificationOptions) {
        created.push(options);
      }
    }
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;

    expect(notifier.notify('Descanso', 'Acabou')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(created).toHaveLength(1);
  });

  it('plays the pre-rendered track instead of Web Audio on iOS', async () => {
    useIOSUserAgent();
    const notifier = await loadNotifier();
    const endsAt = 1_000_000 + 60_000;

    expect(notifier.scheduleRestAlarm(endsAt)).toBe(true);

    const element = FakeAudio.instances[0];
    expect(element.src).toBe('blob:alarm');
    expect(element.play).toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(notifier.restAlarmPlayed(endsAt)).toBe(false);

    element.currentTime = 60.2; // the media pipeline reached the audible part
    expect(notifier.restAlarmPlayed(endsAt)).toBe(true);
  });

  it('plays the pre-rendered track instead of Web Audio on Android', async () => {
    useAndroidUserAgent();
    const notifier = await loadNotifier();
    const endsAt = 1_000_000 + 60_000;

    expect(notifier.scheduleRestAlarm(endsAt)).toBe(true);

    const element = FakeAudio.instances[0];
    expect(element.src).toBe('blob:alarm');
    expect(element.play).toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(notifier.restAlarmPlayed(endsAt)).toBe(false);

    element.currentTime = 60.2;
    expect(notifier.restAlarmPlayed(endsAt)).toBe(true);
  });

  it('falls back to Web Audio when the media element is unavailable', async () => {
    useAndroidUserAgent();
    vi.stubGlobal('Audio', undefined);
    const notifier = await loadNotifier();

    expect(notifier.scheduleRestAlarm(1_000_000 + 5_000)).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('reads the audio clock when the media receipt belongs to an earlier rest', async () => {
    useAndroidUserAgent();
    const notifier = await loadNotifier();
    notifier.scheduleRestAlarm(1_000_000 + 30_000);

    // A later arm runs out of memory building its track and falls back.
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      throw new Error('out of memory');
    });
    const endsAt = 1_000_000 + 60_000;
    notifier.scheduleRestAlarm(endsAt);

    const ctx = FakeAudioContext.instances[0];
    expect(ctx).toBeDefined();
    expect(notifier.restAlarmPlayed(endsAt)).toBe(false);
    ctx.currentTime += 60.1;
    expect(notifier.restAlarmPlayed(endsAt)).toBe(true);
  });

  it('keeps the iOS play receipt after a cancel', async () => {
    useIOSUserAgent();
    const notifier = await loadNotifier();
    const endsAt = 1_000_000 + 60_000;

    notifier.scheduleRestAlarm(endsAt);
    const element = FakeAudio.instances[0];
    element.currentTime = 60.5;

    notifier.cancelRestAlarm();
    expect(element.pause).toHaveBeenCalled();
    expect(notifier.restAlarmPlayed(endsAt)).toBe(true);
  });

  it('leaves the media path alone on desktop', async () => {
    const notifier = await loadNotifier();

    notifier.scheduleRestAlarm(1_000_000 + 5_000);

    expect(FakeAudio.instances).toHaveLength(0);
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('retries the iOS unlock from a later gesture', async () => {
    useIOSUserAgent();
    FakeAudio.rejectPlay = true;
    const notifier = await loadNotifier();

    notifier.primeAudio();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const element = FakeAudio.instances[0];
    expect(element.play).toHaveBeenCalledTimes(1);

    FakeAudio.rejectPlay = false;
    notifier.primeAudio(); // a blocked unlock must not be lost for the session
    expect(element.play).toHaveBeenCalledTimes(2);
  });

  it('unlocks the iOS media element once', async () => {
    useIOSUserAgent();
    const notifier = await loadNotifier();

    notifier.primeAudio();
    await new Promise((resolve) => setTimeout(resolve, 0));
    notifier.primeAudio();

    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(1);
  });

  it('encodes silence followed by the alarm as an 8 kHz mono WAV', async () => {
    useIOSUserAgent();
    const notifier = await loadNotifier();
    const silenceSec = 2;

    notifier.scheduleRestAlarm(1_000_000 + silenceSec * 1_000);

    const blobs = vi.mocked(URL.createObjectURL).mock.calls.map(([blob]) => blob as Blob);
    const bytes = new Uint8Array(await blobs[blobs.length - 1].arrayBuffer());
    const view = new DataView(bytes.buffer);
    const ascii = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));

    expect(ascii(0)).toBe('RIFF');
    expect(ascii(8)).toBe('WAVE');
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(40, true)).toBe(bytes.length - 44);
    expect(bytes.length - 44).toBe(silenceSec * 8000 + Math.ceil(1.68 * 8000));

    const data = bytes.subarray(44);
    expect(data.subarray(0, silenceSec * 8000).every((value) => value === 128)).toBe(true);
    // Every burst must start in its own window of the alarm.
    for (const delay of [0, 0.26, 0.52, 0.78, 1.04, 1.3]) {
      expect(data[silenceSec * 8000 + Math.round(delay * 8000) + 10]).not.toBe(128);
    }
  });
});

describe('notifier inside the Android app', () => {
  const endsAt = 1_000_000 + 45_000;

  async function loadNative() {
    plugin.isNative = true;
    const notifier = await loadNotifier();
    await notifier.initRestAlarm();
    return notifier;
  }

  function scheduled(): Array<{
    notifications: Array<{
      id: number;
      channelId: string;
      autoCancel: boolean;
      isExactNotification: boolean;
      schedule: { at: Date; allowWhileIdle: boolean };
    }>;
  }> {
    return plugin.schedule.mock.calls.map((call) => call[0]);
  }

  function lastAlarm() {
    const alarms = scheduled();
    return alarms[alarms.length - 1].notifications[0];
  }

  it('arms an exact alarm at the deadline instead of Web Audio', async () => {
    const notifier = await loadNative();

    expect(notifier.scheduleRestAlarm(endsAt)).toBe(true);

    const alarm = lastAlarm();
    expect(alarm.id).toBe(1);
    expect(alarm.channelId).toBe('rest-v1');
    expect(alarm.autoCancel).toBe(true);
    expect(alarm.schedule.at).toEqual(new Date(endsAt));
    expect(alarm.schedule.allowWhileIdle).toBe(true);
    expect(alarm.isExactNotification).toBe(true);
    expect(notifier.restAlarmPlayed(endsAt)).toBe(true);

    // The OS owns the sound; the WebView must not hold the audio session.
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('creates a high-importance channel with the bundled alarm sound', async () => {
    await loadNative();

    expect(plugin.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rest-v1', importance: 4, sound: 'rest_alarm', vibration: true }),
    );
  });

  it('replaces the same alarm id on +15s and clears it on skip', async () => {
    const notifier = await loadNative();

    notifier.scheduleRestAlarm(endsAt);
    notifier.scheduleRestAlarm(endsAt + 15_000);

    expect(scheduled().map((call) => call.notifications[0].id)).toEqual([1, 1]);
    expect(scheduled().map((call) => call.notifications[0].schedule.at.getTime())).toEqual([
      endsAt,
      endsAt + 15_000,
    ]);
    expect(notifier.restAlarmPlayed(endsAt)).toBe(false);

    notifier.cancelRestAlarm();
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
    expect(notifier.restAlarmPlayed(endsAt + 15_000)).toBe(false);
  });

  it('stops asking for exact alarms when the plugin falls back to inexact', async () => {
    plugin.schedule.mockResolvedValueOnce({ warning: 'OS-PLUG-LNOT-0017' });
    const notifier = await loadNative();

    notifier.scheduleRestAlarm(endsAt);
    await new Promise((resolve) => setTimeout(resolve, 0));
    notifier.scheduleRestAlarm(endsAt + 15_000);

    const alarms = scheduled();
    expect(alarms[0].notifications[0].isExactNotification).toBe(true);
    expect(alarms[1].notifications[0].isExactNotification).toBe(false);
  });

  it('schedules inexact until the settings button grants exact alarms', async () => {
    plugin.checkExact.mockResolvedValue({ exact_alarm: 'denied' });
    const notifier = await loadNative();
    expect(await notifier.checkExactAlarmPermission()).toBe(false);

    notifier.scheduleRestAlarm(endsAt);
    expect(lastAlarm().isExactNotification).toBe(false);

    expect(await notifier.requestExactAlarmPermission()).toBe(true);
    expect(plugin.changeExact).toHaveBeenCalled();
    notifier.scheduleRestAlarm(endsAt);
    expect(lastAlarm().isExactNotification).toBe(true);
  });

  it('hands a failed schedule back to the foreground beep', async () => {
    const notifier = await loadNative();
    plugin.schedule.mockRejectedValueOnce(new Error('no alarm manager'));

    notifier.scheduleRestAlarm(endsAt);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notifier.restAlarmPlayed(endsAt)).toBe(false);

    expect(notifier.playRestBeep(endsAt)).toBe(true);
    expect(notifier.restAlarmPlayed(endsAt)).toBe(true);
  });

  it('vibrates through Haptics with the summed pattern length', async () => {
    const notifier = await loadNative();

    expect(notifier.vibrate()).toBe(true);
    expect(plugin.haptics).toHaveBeenCalledWith({ duration: 750 });

    expect(notifier.vibrate(40)).toBe(true);
    expect(plugin.haptics).toHaveBeenCalledWith({ duration: 50 });
  });

  it('asks the plugin for notification permission and never notifies from the WebView', async () => {
    const notifier = await loadNative();
    class WebNotification {
      static permission = 'granted';
      constructor() {
        throw new Error('the web path must not run inside the app');
      }
    }
    (window as unknown as { Notification: unknown }).Notification = WebNotification;

    plugin.requestPermissions.mockResolvedValue({ display: 'denied' });
    expect(await notifier.requestNotificationPermission()).toBe(false);
    plugin.requestPermissions.mockResolvedValue({ display: 'granted' });
    expect(await notifier.requestNotificationPermission()).toBe(true);

    expect(notifier.notify('Descanso', 'Acabou')).toBe(false);
  });
});
