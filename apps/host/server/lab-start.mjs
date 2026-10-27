/** Wait for the existing Windows supervisor to own this process before importing the host. */
import { isAbsolute } from 'node:path';
import { labConfig } from './lab-managed.mjs';
if (!labConfig()) throw new Error('This entry point requires an explicit Lab attachment.');
for (const key of ['STRATA_HOME', 'STRATA_WORKSPACE', 'STRATA_SETTINGS_FILE', 'STRATA_COMPONENTS_DIR']) {
  if (!process.env[key] || !isAbsolute(process.env[key])) throw new Error(`The isolated ${key} location is required.`);
}
const gate = await new Promise(resolve => process.stdin.once('data', value => resolve(value.toString())));
if (gate !== 'G') throw new Error('The owned-process startup gate was not released.');
Object.assign(process.env, { STRATA_REAL_ENGINE: '1', STRATA_AGENT: 'off', STRATA_NO_ACQUIRE: '1',
  STRATA_NO_REPAIR_ACCESS: '1', STRATA_NO_BUNDLED_ENGINE: '1', STRATA_BIND: '127.0.0.1' });
await import('./index.mjs');
