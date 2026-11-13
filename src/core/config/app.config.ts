/** Single place for app-wide constants. Catalogs live in `src/seed`. */
export const APP_CONFIG = {
  appName: 'IronLog',
  dbName: 'ironlog',
  schemaVersion: 1,
  seedVersion: 1,
  exportVersion: 1,
  consentVersion: '2026-11',
  defaults: {
    locale: 'pt-BR',
    unit: 'kg',
    weekStartsOn: 1,
    restDefaultSec: 90,
    formulaId: 'epley',
    barWeightKg: 20,
  },
  rest: {
    stepSec: 15,
    minSec: 15,
    maxSec: 900,
    tickMs: 500,
  },
  units: ['kg', 'lb'] as const,
  loadStep: { kg: 2.5, lb: 5 },
  reps: { min: 1, max: 100, step: 1 },
  rpe: { min: 1, max: 10, step: 0.5 },
  workout: {
    maxSetsPerExercise: 25,
    defaultSetTypeId: 'working',
    freeSessionName: 'Treino livre',
  },
  plates: { minPairs: 0, maxPairs: 20 },
  security: {
    pinMinLength: 6,
    pinMaxLength: 12,
    kdf: {
      probeTargetMs: 50,
      probeIterations: 2000,
      minIterations: 100_000,
      maxIterations: 310_000,
      saltBytes: 16,
      roundTo: 10_000,
    },
    backup: {
      passwordMinLength: 8,
      iterations: 600_000,
      maxIterations: 1_000_000,
    },
    vaultNoteMaxLength: 500,
  },
  analytics: {
    defaultWeeks: 12,
    maxChartPoints: 180,
    heatmapYearsBack: 1,
    prLimit: 6,
  },
  performance: {
    listRowHeight: 64,
    virtualOverscan: 6,
    chartAnimations: false,
    lowCoreThreshold: 4,
  },
  privacy: {
    csp:
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'none'; object-src 'none'",
  },
} as const;
