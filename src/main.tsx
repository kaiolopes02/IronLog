import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import '@/styles.css';
import { App } from '@/app/App';
import { boot } from '@/app/services';

function renderFatal(root: HTMLElement, message: string): void {
  root.textContent = '';
  const box = document.createElement('div');
  box.style.padding = '24px';
  box.style.color = '#F5F5F5';
  box.style.fontFamily = 'system-ui, sans-serif';
  const title = document.createElement('p');
  title.style.fontWeight = '700';
  title.textContent = 'IronLog';
  const body = document.createElement('p');
  body.style.marginTop = '8px';
  body.style.fontSize = '14px';
  body.textContent = message;
  box.append(title, body);
  root.append(box);
}

async function start(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  try {
    const bootResult = await boot();
    render(<App bootResult={bootResult} />, root);
    if (bootResult.services.capabilities.serviceWorker) {
      try {
        registerSW({ immediate: true });
      } catch {
        /* offline install is optional; the app still runs */
      }
    }
  } catch (error) {
    console.error('IronLog failed to boot', error);
    renderFatal(root, 'Não foi possível abrir o banco local. Verifique se o navegador permite IndexedDB.');
  }
}

void start();
