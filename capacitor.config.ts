/// <reference types="@capacitor/local-notifications" />
import type { CapacitorConfig } from '@capacitor/cli';

/**
 * `server.androidScheme` is omitted on purpose: `https` is Capacitor's default
 * and the vault needs that secure context for `crypto.subtle`.
 */
const config: CapacitorConfig = {
  appId: 'com.ironlog.app',
  appName: 'IronLog',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      iconColor: '#F97316',
    },
  },
};

export default config;
