import type { Config } from 'tailwindcss';

/** Every visual constant lives here; components only reference tokens. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#000000',
        surface: '#121212',
        raised: '#181818',
        line: '#262626',
        ink: '#F5F5F5',
        muted: '#9A9A9A',
        primary: '#F97316',
        'on-primary': '#0A0A0A',
        success: '#22C55E',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      borderWidth: { hair: '1px' },
      minHeight: { touch: '48px' },
      minWidth: { touch: '48px' },
      screens: { xs: '375px' },
    },
  },
  corePlugins: { preflight: true },
} satisfies Config;
