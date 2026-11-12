import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';

/** Dexie live query bound to Preact state; keeps every screen in sync. */
export function useLiveQuery<T>(
  query: () => Promise<T>,
  deps: readonly unknown[],
  initial: T,
): T;
export function useLiveQuery<T>(
  query: () => Promise<T>,
  deps?: readonly unknown[],
): T | undefined;
export function useLiveQuery<T>(
  query: () => Promise<T>,
  deps: readonly unknown[] = [],
  initial?: T,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(initial);
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: (next) => setValue(next),
      error: (error) => console.error('liveQuery failed', error),
    });
    return () => subscription.unsubscribe();
  }, deps);
  return value;
}
