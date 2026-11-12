import { lazy, Suspense } from 'preact/compat';
import type { JSX } from 'preact';
import { isActive, navigate, type Route, useRoute } from '@/app/router';
import { useI18n } from '@/core/i18n';
import { HomeScreen } from '@/features/home/HomeScreen';
import { WorkoutsScreen } from '@/features/workouts/WorkoutsScreen';
import { ActiveWorkoutScreen } from '@/features/workouts/ActiveWorkoutScreen';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { BodyScreen } from '@/features/biometrics/BodyScreen';
import { RoutineEditorScreen } from '@/features/workouts/RoutineEditorScreen';
import {
  IconChart,
  IconDumbbell,
  IconHome,
  IconLibrary,
  IconSettings,
} from '@/shared/components/icons';

const ProgressScreen = lazy(() => import('@/features/analytics/ProgressScreen'));

const NAV_ITEMS = [
  { path: '/', labelKey: 'nav.home', Icon: IconHome },
  { path: '/workouts', labelKey: 'nav.workouts', Icon: IconDumbbell },
  { path: '/library', labelKey: 'nav.library', Icon: IconLibrary },
  { path: '/progress', labelKey: 'nav.progress', Icon: IconChart },
  { path: '/settings', labelKey: 'nav.settings', Icon: IconSettings },
] as const;

function NavBar({ route }: { route: Route }) {
  const { t } = useI18n();
  return (
    <nav
      aria-label="IronLog"
      class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg safe-bottom"
    >
      <div class="mx-auto flex max-w-xl items-stretch">
        {NAV_ITEMS.map(({ path, labelKey, Icon }) => {
          const active = isActive(route, path);
          return (
            <button
              key={path}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(path)}
              class={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                active ? 'text-primary' : 'text-muted'
              }`}
            >
              <Icon size={20} />
              {t(labelKey)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function CurrentScreen({ route }: { route: Route }) {
  const { t } = useI18n();
  const [first] = route.segments;
  switch (first) {
    case undefined:
      return <HomeScreen />;
    case 'session':
      return <ActiveWorkoutScreen />;
    case 'workouts':
      if (route.segments[1] === 'edit') return <RoutineEditorScreen />;
      return <WorkoutsScreen />;
    case 'library':
      return <LibraryScreen />;
    case 'body':
      return <BodyScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'progress':
      return (
        <Suspense fallback={<p class="p-4 text-sm text-muted">{t('common.loading')}</p>}>
          <ProgressScreen />
        </Suspense>
      );
    default:
      return <p class="p-4 text-sm text-muted">{t('common.empty')}</p>;
  }
}

export function Shell(): JSX.Element {
  const route = useRoute();

  return (
    <div class="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-bg">
      <main class="flex flex-1 flex-col pb-[calc(64px+env(safe-area-inset-bottom))]">
        <CurrentScreen route={route} />
      </main>
      <NavBar route={route} />
    </div>
  );
}
