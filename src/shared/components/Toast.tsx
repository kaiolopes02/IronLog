import { useEffect, useState } from 'preact/hooks';

type Tone = 'info' | 'error';
type ToastMessage = { id: number; text: string; tone: Tone };

let current: ToastMessage | null = null;
let seq = 0;
const listeners = new Set<(message: ToastMessage | null) => void>();

export function toast(text: string, tone: Tone = 'info'): void {
  current = { id: ++seq, text, tone };
  listeners.forEach((listener) => listener(current));
}

export function ToastHost() {
  const [message, setMessage] = useState<ToastMessage | null>(current);

  useEffect(() => {
    listeners.add(setMessage);
    return () => {
      listeners.delete(setMessage);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const handle = setTimeout(() => {
      if (current?.id === message.id) {
        current = null;
        listeners.forEach((listener) => listener(null));
      }
    }, 2600);
    return () => clearTimeout(handle);
  }, [message]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      class={`fixed inset-x-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 rounded-lg border px-3 py-2 text-sm ${
        message.tone === 'error'
          ? 'border-danger/50 bg-[#2A1212] text-ink'
          : 'border-line bg-raised text-ink'
      }`}
    >
      {message.text}
    </div>
  );
}
