import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Unmocked Capacitor resolves to the web implementation in jsdom; the native
// paths are plugin calls, so they have to be faked to be observable.
const plugin = vi.hoisted(() => ({
  isNative: false,
  schedule: vi.fn(),
  cancel: vi.fn(),
  createChannel: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  checkExact: vi.fn(),
  changeExact: vi.fn(),
  haptics: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => plugin.isNative },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    createChannel: plugin.createChannel,
    checkPermissions: plugin.checkPermissions,
    requestPermissions: plugin.requestPermissions,
    checkExactNotificationSetting: plugin.checkExact,
    changeExactNotificationSetting: plugin.changeExact,
    schedule: plugin.schedule,
    cancel: plugin.cancel,
  },
}));

vi.mock('@capacitor/haptics', () => ({ Haptics: { vibrate: plugin.haptics } }));

async function loadNotifier() {
  return import('@/core/platform/notifier');
}

beforeEach(() => {
  vi.resetModules();
  plugin.isNative = false;
  plugin.schedule.mockReset().mockResolvedValue({});
  plugin.cancel.mockReset().mockResolvedValue(undefined);
  plugin.createChannel.mockReset().mockResolvedValue(undefined);
  plugin.checkPermissions.mockReset().mockResolvedValue({ display: 'granted' });
  plugin.requestPermissions.mockReset().mockResolvedValue({ display: 'granted' });
  plugin.checkExact.mockReset().mockResolvedValue({ exact_alarm: 'granted' });
  plugin.changeExact.mockReset().mockResolvedValue({ exact_alarm: 'granted' });
  plugin.haptics.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'Notification');
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('notifier in the browser', () => {
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

  it('has no natively armed alarm outside the app', async () => {
    const notifier = await loadNotifier();
    expect(notifier.scheduleRestAlarm(Date.now() + 60_000)).toBe(false);
    expect(plugin.schedule).not.toHaveBeenCalled();
    expect(plugin.createChannel).not.toHaveBeenCalled();
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

  it('exposes no web-audio entry point at all', async () => {
    const notifier = await loadNotifier();
    expect(Object.keys(notifier)).not.toContain('playRestBeep');
    expect(Object.keys(notifier)).not.toContain('primeAudio');
    expect(Object.keys(notifier)).not.toContain('restAlarmPlayed');
  });

  it('arms a silent exact alarm at the deadline', async () => {
    const notifier = await loadNative();

    expect(notifier.scheduleRestAlarm(endsAt)).toBe(true);

    const alarm = lastAlarm();
    expect(alarm.id).toBe(1);
    expect(alarm.channelId).toBe('rest-v2');
    expect(alarm.autoCancel).toBe(true);
    expect(alarm.schedule.at).toEqual(new Date(endsAt));
    expect(alarm.schedule.allowWhileIdle).toBe(true);
    expect(alarm.isExactNotification).toBe(true);
  });

  it('creates a high-importance channel without any sound', async () => {
    await loadNative();

    expect(plugin.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rest-v2', importance: 4, vibration: true }),
    );
    expect(plugin.createChannel.mock.calls[0][0]).not.toHaveProperty('sound');
  });

  it('asks for notification permission at boot while Android still prompts', async () => {
    plugin.checkPermissions.mockResolvedValue({ display: 'prompt' });

    await loadNative();

    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('does not re-prompt once notifications are granted', async () => {
    await loadNative();
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
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

    notifier.cancelRestAlarm();
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
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

  it('survives a failed schedule without breaking the rest flow', async () => {
    const notifier = await loadNative();
    plugin.schedule.mockRejectedValueOnce(new Error('no alarm manager'));

    expect(notifier.scheduleRestAlarm(endsAt)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    notifier.cancelRestAlarm();
    expect(plugin.cancel).toHaveBeenCalled();
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
