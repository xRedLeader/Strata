/** Opt-in Lab attachment. The ordinary Strata app keeps its existing behavior. */
import { randomBytes, timingSafeEqual } from 'node:crypto';

const READS = new Set([
  '/api/health', '/api/setup', '/api/hardware', '/api/models', '/api/engine',
  '/api/serving', '/api/monitor', '/api/skills', '/api/model-providers', '/api/image-models',
  '/api/runtime', '/api/workspaces', '/api/workspace', '/api/events', '/api/fonts',
  '/api/app/mode', '/api/control/status', '/api/native', '/api/agent/status',
  '/api/agent/pending', '/api/goal', '/api/plan', '/api/chat/folder', '/api/chat/attachments',
]);

export function labConfig(env = process.env) {
  if (env.STRATA_LAB_MANAGED !== '1') return null;
  const instance = env.STRATA_LAB_INSTANCE ?? '';
  const workspace = env.STRATA_LAB_WORKSPACE ?? '';
  const token = env.STRATA_LAB_CONTROL_TOKEN ?? '';
  if (!/^[a-f0-9]{32}$/.test(instance) || !/^[a-f0-9]{64}$/.test(workspace) || !/^[a-f0-9]{64}$/.test(token))
    throw new Error('The Lab attachment identity is missing or invalid. Open Strata from MicroExpert Lab.');
  const url = new URL(env.STRATA_LAB_INFERENCE_URL ?? '');
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash
      || url.pathname !== '/mel/v1/strata/runtime/v1') throw new Error('The Lab connection must be the explicit local managed endpoint.');
  return Object.freeze({ instance, workspace, token, baseUrl: url.href.replace(/\/$/, '') });
}

export const MANAGED = labConfig();
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createLabAccess(config, { now = Date.now } = {}) {
  const tickets = new Map(), sessions = new Map();
  const cookie = `mel_strata_${config.instance}`;
  function trusted(req) { return equal(req.headers.authorization, `Bearer ${config.token}`); }
  function authenticated(req) {
    const value = String(req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookie}=`))?.slice(cookie.length + 1);
    const expiry = sessions.get(value);
    if (!expiry || expiry <= now()) { sessions.delete(value); return false; }
    return true;
  }
  function issue(req) {
    if (!trusted(req)) throw new Error('Lab control authentication required.');
    for (const [key, expiry] of tickets) if (expiry <= now()) tickets.delete(key);
    if (tickets.size >= 16) throw new Error('Too many pending window connections.');
    const ticket = randomBytes(32).toString('hex');
    tickets.set(ticket, now() + 30_000);
    return ticket;
  }
  function pair(ticket) {
    const expiry = tickets.get(ticket); tickets.delete(ticket);
    if (!expiry || expiry <= now()) throw new Error('This window connection expired or was already used. Open Strata from Lab again.');
    for (const [key, until] of sessions) if (until <= now()) sessions.delete(key);
    if (sessions.size >= 16) throw new Error('Too many open window connections.');
    const session = randomBytes(32).toString('hex'); sessions.set(session, now() + 3600_000);
    return `${cookie}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`;
  }
  function allowed(method, path) {
    return (method === 'GET' && READS.has(path)) || (method === 'POST' && ['/api/chat/stream', '/api/chat/stop'].includes(path));
  }
  return { trusted, authenticated, issue, pair, allowed };
}

export function managedStatus(config) {
  return { managed: true, contract: 'mel-strata-ui-v1', instance_id: config.instance,
    lab_url: new URL(config.baseUrl).origin,
    workspace_identity: config.workspace, model_control: 'MicroExpert Lab', tools_enabled: false,
    research_enabled: false, automatic_downloads: false, fallback_enabled: false,
    qualification: 'UI connection only; real runtime and research require separate qualification' };
}

export async function managedBackend(config, fetchImpl = fetch) {
  const unavailable = reason => ({ kind: 'unavailable', name: 'Lab managed runtime', baseUrl: null, models: [], error: reason });
  try {
    const response = await fetchImpl(`${config.baseUrl}/status`, { headers: { authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(1500), redirect: 'error' });
    if (!response.ok) return unavailable('The managed runtime is unavailable. Review its status in MicroExpert Lab. No other model was selected.');
    const state = await response.json();
    if (state.service !== 'mel-strata-runtime' || state.instance_id !== config.instance || state.workspace_identity !== config.workspace)
      return unavailable('The runtime identity does not match this Lab window. No request was sent.');
    if (state.loaded !== true || typeof state.model !== 'string' || !state.model)
      return unavailable(state.reason || 'No qualified runtime is loaded. Return to MicroExpert Lab.');
    return { kind: 'strata', name: 'Lab managed runtime', baseUrl: config.baseUrl, models: [state.model], modelId: state.model,
      loaded: true, context: state.context, managed: true };
  } catch { return unavailable('The Lab connection was lost. No fallback model was selected. Reconnect from MicroExpert Lab.'); }
}
