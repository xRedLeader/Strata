/** Real composer handler + store/client, with synthetic fetch and browser state. No model or live host. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build, transform } from 'esbuild';
import ts from 'typescript';

const {outputFiles} = await build({entryPoints:[fileURLToPath(new URL('../src/lib/store.ts', import.meta.url))],
  bundle:true, write:false, platform:'node', format:'cjs', logLevel:'silent',
  alias:{react:fileURLToPath(new URL('./helpers/react-stub.mjs', import.meta.url))}});
const chatSource = await readFile(new URL('../src/screens/Chat.tsx', import.meta.url), 'utf8');
const chatAst = ts.createSourceFile('Chat.tsx', chatSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submitSource;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'submit') submitSource = node.getText(chatAst);
  ts.forEachChild(node, visit);
}
visit(chatAst);
assert.ok(submitSource, 'execute the actual composer handler, not a copied implementation');
const submitJs = (await transform(submitSource, {loader:'ts'})).code;
const ready = {managed:true, loaded:true, modelId:'fixture-coder'};

function harness({managed=true, runtime=ready, native=null, library=null, remote=null} = {}) {
  const calls=[];
  const document={documentElement:{dataset:{labManaged:managed?'1':'0'},style:{setProperty(){}}}, querySelector:()=>null};
  const window={location:{hash:''}, matchMedia:()=>({matches:false, addEventListener(){}}), dispatchEvent(){}};
  const storage={getItem:()=>null, setItem(){}, removeItem(){}};
  const fetch=async (url, options={}) => {
    calls.push({url, options});
    if (url === '/api/lab/runtime') {
      if (runtime instanceof Error) throw runtime;
      return runtime instanceof Response ? runtime : Response.json(typeof runtime==='function'?await runtime():runtime);
    }
    if (url === '/api/chat/stream') return new Response(JSON.stringify({type:'delta',text:'FIXTURE'})+'\n'+JSON.stringify({type:'done',tokensOut:1})+'\n');
    throw new Error(`Unexpected request: ${url}`);
  };
  const module={exports:{}};
  new Function('require','module','exports','document','window','navigator','localStorage','sessionStorage','fetch','setTimeout','clearTimeout','matchMedia',outputFiles[0].text)(
    createRequire(import.meta.url),module,module.exports,document,window,{language:'en'},storage,storage,fetch,()=>0,()=>{},window.matchMedia);
  const store=module.exports;
  Object.assign(store.getState(),{connection:'live', library, remoteModel:remote});
  // Native state remains absent for managed sends; standalone loaded state is exercised through the library.
  const draft={value:'Reply with exactly READY.'};
  let sent;
  const submit=new Function('draft','queuedPhotos','streaming','session','timeSkipPrompt','managed','chatNative','loaded','noModelNotice','pushToast','tr','updateDraft','sendMessage',
    submitJs+'; return submit;')(draft.value,[],false,null,()=>null,managed,native,library?.loaded,
    () => ({title:'No model is loaded'}), (...args)=>store.pushToast(...args),v=>v,v=>{draft.value=v;},v=>{sent=store.sendMessage(v);});
  return {store,calls,draft,async submit(){submit();await sent;}};
}

test('managed composer and shared send reach the real transport without standalone model state', async () => {
  const h=harness(); await h.submit();
  assert.deepEqual(h.calls.map(c=>c.url), ['/api/lab/runtime','/api/chat/stream']);
  assert.equal(h.calls[0].options.cache,'no-store');
  assert.equal(h.calls[0].options.redirect,'error');
  assert.ok(h.calls[0].options.signal instanceof AbortSignal);
  assert.equal(JSON.parse(h.calls[1].options.body).message,'Reply with exactly READY.');
  assert.deepEqual(h.store.getState().sessions[0].messages.map(m=>m.content),['Reply with exactly READY.','FIXTURE']);
  assert.equal(h.store.getState().toasts.length,0);
});

for (const [name,runtime] of Object.entries({unavailable:{loaded:false},unmanaged:{loaded:true,modelId:'other'},
  missingIdentity:{managed:true,loaded:true},wrongTypes:{managed:true,loaded:'true',modelId:'fixture'},
  disconnected:new Error('offline'),rejected:new Response('blocked',{status:409}),malformed:new Response('{')})) {
  test(`managed ${name} fails before conversation mutation, without standalone/cloud fallback`,async()=>{
    const h=harness({runtime,library:{loaded:'standalone'},remote:{model:'cloud'}});
    await h.store.sendMessage('Reply with exactly READY.');
    assert.deepEqual(h.calls.map(c=>c.url),['/api/lab/runtime']);
    assert.equal(h.store.getState().sessions.length,0);
    assert.equal(h.store.getState().toasts.at(-1).title,'No Lab runtime is ready');
  });
}

test('a subsequent send rechecks readiness rather than trusting the earlier banner/read',async()=>{
  let available=true;
  const h=harness({runtime:()=>available?ready:{loaded:false}});
  await h.submit(); available=false;
  const before=JSON.stringify(h.store.getState().sessions);
  await h.store.sendMessage('second');
  assert.equal(h.calls.filter(c=>c.url==='/api/lab/runtime').length,2);
  assert.equal(h.calls.filter(c=>c.url==='/api/chat/stream').length,1);
  assert.equal(JSON.stringify(h.store.getState().sessions),before);
});

test('changing conversations during readiness check never sends into the new conversation',async()=>{
  let release;
  const h=harness({runtime:()=>new Promise(resolve=>{release=resolve;})});
  const sending=h.store.sendMessage('first');
  h.store.newSession(); release(ready); await sending;
  assert.equal(h.calls.length,1);
  assert.equal(h.store.getState().sessions[0].messages.length,0);
});

test('concurrent readiness checks reserve only one active conversation send',async()=>{
  const releases=[];
  const h=harness({runtime:()=>new Promise(resolve=>releases.push(resolve))});
  const a=h.store.sendMessage('first'), b=h.store.sendMessage('second');
  for (const release of releases) release(ready);
  await Promise.all([a,b]);
  assert.equal(h.calls.filter(c=>c.url==='/api/chat/stream').length,1);
});

test('standalone no-model guard is unchanged and never queries Lab',async()=>{
  const h=harness({managed:false}); await h.submit();
  assert.equal(h.calls.length,0);
  assert.equal(h.store.getState().sessions.length,0);
  assert.equal(h.store.getState().toasts[0].title,'No model is loaded');
  await h.store.sendMessage('direct');
  assert.equal(h.calls.length,0);
  assert.equal(h.store.getState().toasts.at(-1).title,'Still starting up');
});

test('standalone loaded-library send continues through its existing transport',async()=>{
  const h=harness({managed:false,library:{loaded:'standalone'}});
  await h.store.sendMessage('hello');
  assert.deepEqual(h.calls.map(c=>c.url),['/api/chat/stream']);
  assert.equal(h.store.getState().sessions[0].messages.at(-1).content,'FIXTURE');
});

for (const [name, text, options] of [
  ['loop', '/loop 1m check again', {}],
  ['time-skip', '/time-skip check again', {}],
  ['loop round', 'hello', {fromLoop:true}],
  ['goal resume', '', {goalAction:'resume'}],
  ['plan', '', {planId:'fixture-plan'}],
  ['reattach', '', {reattach:'fixture-chat'}],
]) {
  test(`managed ${name} cannot dispatch new upstream automation paths`,async()=>{
    const h=harness();
    await h.store.sendMessage(text,options);
    assert.deepEqual(h.calls,[]);
    assert.equal(h.store.getState().sessions.length,0);
    assert.equal(h.store.getState().toasts.at(-1)?.title,'Use the bounded Lab conversation');
  });
}

test('managed busy send cannot queue work for later execution',async()=>{
  const h=harness();
  Object.assign(h.store.getState(),{streaming:true,activeSession:'fixture-chat'});
  await h.store.sendMessage('run this later');
  assert.deepEqual(h.calls,[]);
  assert.equal(h.store.getState().sessions.length,0);
  assert.equal(h.store.getState().toasts.at(-1)?.title,'Use the bounded Lab conversation');
});
