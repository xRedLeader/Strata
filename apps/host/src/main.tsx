import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/kit/tokens.css';
import './styles/kit/components.css';
import './styles/app.css';
import { App } from './app/App';
import { installDropGuard } from './components/DropZone';

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');

installDropGuard();

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
