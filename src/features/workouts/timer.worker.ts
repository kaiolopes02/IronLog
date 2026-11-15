/// <reference lib="webworker" />

/**
 * Fires once at `endsAt`. A dedicated worker is not subject to the hidden-tab
 * timer clamping that pushes a page's setTimeout to one per minute.
 */
const worker = self as unknown as DedicatedWorkerGlobalScope;
let handle: ReturnType<typeof setTimeout> | null = null;

// The media alarm starts on its own clock; let it finish before the fallback
// alert fires on top of it.
const GRACE_MS = 2_000;

worker.addEventListener('message', (event: MessageEvent<{ endsAt: number } | null>) => {
  if (handle !== null) clearTimeout(handle);
  handle = null;
  const endsAt = event.data?.endsAt;
  if (typeof endsAt !== 'number') return;
  handle = setTimeout(() => {
    handle = null;
    worker.postMessage({ endsAt });
  }, Math.max(0, endsAt - Date.now() + GRACE_MS));
});
