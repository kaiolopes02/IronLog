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
    // The native drawables carry the logo; this keeps the window black between
    // them and the first WebView paint.
    SplashScreen: {
      backgroundColor: '#000000',
    },
    // Dark bars match the OLED theme, and the hint keeps the first paint from
    // shifting while the viewport meta tag is being read.
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
