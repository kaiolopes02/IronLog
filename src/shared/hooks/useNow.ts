import { useEffect, useState } from 'preact/hooks';

/** Ticking clock used by the rest timer and the session chronometer. */
export function useNow(active: boolean, intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const handle = setInterval(() => setNow(Date.now()), intervalMs);
    const onVisibility = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, intervalMs]);
  return now;
}
