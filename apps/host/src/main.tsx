import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/kit/tokens.css';
import './styles/kit/components.css';
import './styles/app.css';
import { App } from './app/App';
import { installDropGuard } from './components/DropZone';
import { startRecovery } from './lib/recovery';
import { translationsReady } from './lib/i18n';
import { loadHighlighter } from './components/SyntaxCode';

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');

installDropGuard();
startRecovery();

// The saved language's strings are fetched while the rest of the code loads; the first screen is drawn once they are in (English needs no wait).
// Code colouring (the Prism grammars, 130 kB) is not needed to show the first screen: it is fetched a few seconds later, when the browser is idle,
// so the first code block of the session is already coloured when it appears. A block that appears sooner fetches it itself.
window.setTimeout(() => {
  const idle: (run: () => void) => void = 'requestIdleCallback' in window ? (run) => window.requestIdleCallback(run, { timeout: 4000 }) : (run) => window.setTimeout(run, 0);
  idle(() => { void loadHighlighter(); void import('./components/TimeSkipPanel'); void import('./components/TimeSkipWorking'); });
}, 3000);

async function openApplication() {
  const ticket = new URLSearchParams(location.hash.slice(1)).get('mel_ticket');
  if (ticket) {
    history.replaceState(null, '', location.pathname);
    const response = await fetch('/api/lab/pair', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ticket}) });
    if (!response.ok) throw new Error('This connection expired. Open Strata from MicroExpert Lab again.');
  }
  const response = await fetch('/api/lab/managed');
  if (response.status === 401) throw new Error('Open this Strata window from MicroExpert Lab to reconnect.');
  const connection = response.ok ? await response.json() : null;
  if (connection?.managed) {
    document.documentElement.dataset.labManaged = '1';
    const banner = document.createElement('div');
    banner.setAttribute('role', 'status');
    banner.textContent = 'Managed by MicroExpert Lab. Two-response qualification only: use a fresh conversation and send Reply with exactly READY. No tools, research, or general chat. ';
    const back = document.createElement('a');
    back.textContent = 'Return to Lab';
    back.href = connection.lab_url;
    back.style.cssText = 'color:inherit;text-decoration:underline';
    const runtime = document.createElement('span');
    runtime.dataset.labRuntime = '1';
    runtime.textContent = ' Checking owned runtime… ';
    banner.append(runtime, back);
    banner.style.cssText = 'padding:10px 16px;background:#25353f;color:#fff;font:14px system-ui;';
    el!.before(banner);
    document.body.style.cssText = 'display:grid;grid-template-rows:auto minmax(0,1fr)';
    el!.style.minHeight = '0';
  }
  await translationsReady();
  createRoot(el!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
}
void openApplication().catch(error => { el.textContent = error instanceof Error ? error.message : 'Open Strata from MicroExpert Lab again.'; });

import './styles/annotation-fixes.css';
import './styles/monitor.css';
import './styles/time-skip.css';

import './styles/model-run.css';

import './styles/onboarding.css';

import './styles/board.css';

import './styles/gpu-roles.css';

import './styles/engine-tab.css';

// Loaded last: the shared depth, material and interaction treatment. See the
// header of the file for the order of the layers and why it sits here.
import './styles/liquid.css';
