import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { translate } from '@/core/i18n';

// Native alarm: AlarmManager wakes the device, so it survives the WebView being
// frozen or killed. Armed for a single fixed id, so +15/-15/skip replace it.
const REST_NOTIFICATION_ID = 1;
// Silent on purpose, and a channel's sound is immutable once created, so the
// silent one needs an id of its own. `res/raw/rest_alarm.wav` is left unused.
const REST_CHANNEL_ID = 'rest-v2';
// Exact alarms need a system toggle on Android 12+, and asking for it opens the
// system screen. Never do that mid-workout: until Settings grants it (or the
// plugin warns it fell back), alarms are scheduled inexact.
let exactAllowed = false;

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Creates the channel and asks for notification permission. Called at boot, and
 * again after the user grants the exact-alarm setting.
 */
export async function initRestAlarm(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.createChannel({
      id: REST_CHANNEL_ID,
      name: 'IronLog — descanso',
      description: 'Fim do descanso entre séries',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // Devices without channels still get the notification on the default one.
  }
  try {
    // Nothing else asks for it, and Android 13+ drops the alarm without it.
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'prompt') await LocalNotifications.requestPermissions();
  } catch {
    // Denied: the in-app rest sheet still covers the foreground case.
  }
  exactAllowed = await checkExactAlarmPermission();
}

/** Android 12+ gates exact alarms behind a system toggle. */
export async function checkExactAlarmPermission(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const status = await LocalNotifications.checkExactNotificationSetting();
    return status.exact_alarm === 'granted';
  } catch {
    return false;
  }
}

/** Opens the system screen that grants exact alarms. */
export async function requestExactAlarmPermission(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const status = await LocalNotifications.changeExactNotificationSetting();
    exactAllowed = status.exact_alarm === 'granted';
    return exactAllowed;
  } catch {
    return false;
  }
}

async function scheduleNative(endsAt: number): Promise<void> {
  try {
    const result = await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_NOTIFICATION_ID,
          title: translate('workout.restDone'),
          body: translate('workout.restDoneBody'),
          channelId: REST_CHANNEL_ID,
          autoCancel: true,
          isExactNotification: exactAllowed,
          schedule: {
            at: new Date(endsAt),
            // AlarmManager wakes the device; a rest is short, so the Doze
            // once-per-9-minutes cap never applies in practice.
            allowWhileIdle: true,
          },
        },
      ],
    });
    // 0017/0018: the exact permission is gone. Stop asking for it this session.
    if (result.warning) exactAllowed = false;
  } catch {
    // Nothing else can alert: the in-app sheet still fires at the deadline.
  }
}

/**
 * Arms the OS alarm for `endsAt`. Off-native there is no alarm to arm: the
 * in-page timer plus the browser notification are the only alert.
 */
export function scheduleRestAlarm(endsAt: number): boolean {
  if (!isNative()) return false;
  void scheduleNative(endsAt);
  return true;
}

export function cancelRestAlarm(): void {
  if (!isNative()) return;
  void LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] }).catch(
    () => undefined,
  );
}

export function vibrate(pattern: number | number[] = [300, 150, 300]): boolean {
  if (isNative()) {
    const total = Array.isArray(pattern) ? pattern.reduce((sum, part) => sum + part, 0) : pattern;
    void Haptics.vibrate({ duration: Math.max(50, total) }).catch(() => undefined);
    return true;
  }
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false; // old WebViews: never break the rest flow
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isNative()) {
    try {
      const status = await LocalNotifications.requestPermissions();
      return status.display === 'granted';
    } catch {
      return false;
    }
  }
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
  // The native app already has the alarm scheduled by the OS.
  if (isNative()) return false;
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  // Muted while the sheet is on screen, audible in the background, where this
  // is the only channel left.
  const options: NotificationOptions & { vibrate: number[]; renotify: boolean } = {
    body,
    tag: 'ironlog-rest',
    silent: document.visibilityState === 'visible',
    vibrate: [300, 150, 300],
    renotify: true,
  };
  // `serviceWorker.ready` never rejects — with no active registration it stays
  // pending forever, so ask for the current registration instead and fall back.
  const registration = navigator.serviceWorker?.getRegistration?.();
  if (registration) {
    void registration
      .then((ready) => {
        if (!ready) showDirect(title, options);
        else return ready.showNotification(title, options);
      })
      .catch(() => showDirect(title, options));
    // An attempt was made; the service-worker path settles asynchronously.
    return true;
  }
  return showDirect(title, options);
}

function showDirect(title: string, options: NotificationOptions): boolean {
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
