/** Synthetic protocol fixtures. No engine, model files, source packets, or web requests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { labConfig, createLabAccess, managedBackend, managedStatus } from '../server/lab-managed.mjs';

const env = { STRATA_LAB_MANAGED:'1', STRATA_LAB_INSTANCE:'1'.repeat(32), STRATA_LAB_WORKSPACE:'2'.repeat(64),
  STRATA_LAB_CONTROL_TOKEN:'3'.repeat(64), STRATA_LAB_INFERENCE_URL:'http://127.0.0.1:8765/mel/v1/strata/runtime/v1' };
const config = labConfig(env);
test('standalone behavior remains opt-in; managed identities and endpoint are required', () => {
  assert.equal(labConfig({}), null);
  for (const patch of [{STRATA_LAB_INSTANCE:'foreign'}, {STRATA_LAB_CONTROL_TOKEN:''}, {STRATA_LAB_INFERENCE_URL:'http://example.com/v1'},
    {STRATA_LAB_INFERENCE_URL:'http://127.0.0.1:8765/other'}, {STRATA_LAB_INFERENCE_URL:env.STRATA_LAB_INFERENCE_URL+'?token=secret'}])
    assert.throws(() => labConfig({...env,...patch}));
});
test('short-lived one-use pairing never exposes the control credential', () => {
  let clock=0;
  const access=createLabAccess(config,{now:()=>clock});
  assert.throws(()=>access.issue({headers:{}}));
  const trusted={headers:{authorization:`Bearer ${config.token}`}};
  const ticket=access.issue(trusted);
  const cookie=access.pair(ticket);
  assert.ok(cookie.includes('HttpOnly') && cookie.includes('SameSite=Strict'));
  assert.ok(!cookie.includes(config.token));
  assert.throws(()=>access.pair(ticket));
  assert.ok(access.authenticated({headers:{cookie}}));
  const expired=access.issue(trusted); clock=31_000;
  assert.throws(()=>access.pair(expired));
  clock=3600_001; assert.ok(!access.authenticated({headers:{cookie}}));
});
test('managed route allowlist blocks engines, providers, tools, arbitrary files, schedules and future routes', () => {
  const access=createLabAccess(config);
  for (const [method,path] of [['POST','/api/runtime/load'],['POST','/api/engine/stop'],['POST','/api/native/operations'],
    ['POST','/api/model-providers'],['GET','/api/updates/check'],['GET','/api/files/raw'],['GET','/api/workspace/file'],
    ['PUT','/api/agent/tools'],['POST','/api/plan/start-goal'],['POST','/api/tasks'],['POST','/v1/chat/completions'],['GET','/api/future']])
    assert.equal(access.allowed(method,path),false,`${method} ${path}`);
  assert.ok(access.allowed('POST','/api/chat/stream'));
  assert.ok(access.allowed('GET','/api/monitor'));
});
test('only the bound identity supplies a model; failed probes cannot select a different server', async () => {
  const calls=[];
  const state={service:'mel-strata-runtime',instance_id:config.instance,workspace_identity:config.workspace,loaded:true,model:'synthetic-model',context:2048};
  const fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>state};};
  const result=await managedBackend(config,fetch);
  assert.equal(result.modelId,'synthetic-model');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,config.baseUrl+'/status');
  assert.equal(calls[0].options.redirect,'error');
  state.instance_id='foreign'; assert.equal((await managedBackend(config,fetch)).kind,'unavailable');
  state.instance_id=config.instance; state.loaded=false; assert.equal((await managedBackend(config,fetch)).kind,'unavailable');
  assert.equal((await managedBackend(config,async()=>{throw new Error('synthetic offline');})).kind,'unavailable');
  assert.equal(managedStatus(config).research_enabled,false);
});
