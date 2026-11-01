const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
function setup() {
  const messages = [];
  const window = { __cubeNativeNotesAvailable: true, webkit: {messageHandlers: {auroraHost: {postMessage: value => messages.push(value)}}}, crypto: {randomUUID: () => `session-${messages.length}`}, dispatchEvent() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../App/Resources/bridge.js"),"utf8"), {window, Blob, Uint8Array, Promise, Error, Event: class {}, btoa: value => Buffer.from(value,"binary").toString("base64"), atob: value => Buffer.from(value,"base64").toString("binary")});
  return {host:window.auroraHarmonyHost, native:window.__auroraIosHost, window, messages};
}
test("native notes use the existing file bridge and resolve only after all result chunks", async () => {
  const {host,native,window,messages} = setup();
  assert(host.nativeNotesAvailable());
  window.__cubeNativeNotesAvailable=false;
  assert.equal(host.nativeNotesAvailable(),false);
  const id=host.beginSave("Drawing.cubenote");
  host.appendSaveChunk(id,Buffer.from("original").toString("base64"));
  let finished=false;
  const result=host.editNativeNotes(id,"existing-library-id",true).then(r=>{finished=true;return r;});
  assert.equal(messages.at(-1).draftId,"existing-library-id");
  assert.equal(messages.at(-1).readonly,true);
  native.beginNativeNotesResult(id,8);
  native.stageNativeNotesResult(id,Buffer.from("saved").toString("base64"));
  await Promise.resolve(); assert.equal(finished,false);
  native.stageNativeNotesResult(id,Buffer.from("new").toString("base64"));
  native.finishNativeNotesResult(id,{id:"existing-library-id",changed:true,digest:"sha",preview:"data:image/png;base64,AA"});
  assert.equal(await (await result).blob.text(),"savednew");
  host.ackNativeNotes("existing-library-id","sha");
  assert.equal(messages.at(-1).name,"ackNativeNotes");
  assert.equal(messages.at(-1).digest,"sha");
});
test("native recovery returns full archives and errors never masquerade as saved data", async () => {
  const {host,native,messages} = setup();
  const listing=host.listNativeNotes();let id=messages.at(-1).sessionId;
  native.beginNativeNotesResult(id,0);native.finishNativeNotesResult(id,{items:[{id:"draft",fileName:"Drawing.cubenote",savedAt:123}]});
  assert.equal((await listing)[0].id,"draft");
  const reading=host.readNativeNotes("draft");id=messages.at(-1).sessionId;
  native.beginNativeNotesResult(id,7);native.stageNativeNotesResult(id,Buffer.from("history").toString("base64"));native.finishNativeNotesResult(id,{id:"draft",digest:"new"});
  assert.equal(await (await reading).blob.text(),"history");
  const broken=host.readNativeNotes("draft");id=messages.at(-1).sessionId;
  native.beginNativeNotesResult(id,10);native.stageNativeNotesResult(id,Buffer.from("short").toString("base64"));native.finishNativeNotesResult(id,{});
  await assert.rejects(broken,/不完整/);
  const failed=host.readNativeNotes("draft");id=messages.at(-1).sessionId;
  native.beginNativeNotesResult(id,0);native.finishNativeNotesResult(id,{error:"Cannot read archive"});
  await assert.rejects(failed,/Cannot read archive/);
  assert.equal(native.finishNativeNotesResult(id,{}),false);
});
test("existing binary notebook archives cross the actual host helper in multiple complete chunks", async () => {
  const {host,native,window,messages} = setup();
  const ts = require('typescript');
  const helpers = { exports: {} };
  const bytes = Uint8Array.from({length: 2 * 192 * 1024 + 19}, (_, i) => (i * 17) % 256);
  const script = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../harmony/web/src/harmony-host.ts'),'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
  }).outputText;
  vm.runInNewContext(script, {exports: helpers.exports, require: () => ({}), window, Blob, Uint8Array, ArrayBuffer,
    btoa: value => Buffer.from(value,'binary').toString('base64'), atob: value => Buffer.from(value,'base64').toString('binary')});
  let complete = false;
  const result = helpers.exports.editNativeNotebook(new Blob([bytes]), '旧画板.cubenote', 'old-id', true).then(r => {complete=true;return r;});
  while (!messages.some(m => m.name === 'editNativeNotes')) await new Promise(resolve => setImmediate(resolve));
  assert.equal(complete, false);
  const begin = messages.find(m => m.name === 'beginSave');
  const chunks = messages.filter(m => m.name === 'appendSaveChunk');
  const open = messages.find(m => m.name === 'editNativeNotes');
  assert.equal(chunks.length, 3); assert(chunks.every(m => m.sessionId === begin.sessionId));
  assert.equal(open.sessionId, begin.sessionId); assert.equal(open.readonly, true);
  assert.deepEqual(Buffer.concat(chunks.map(m => Buffer.from(m.chunk,'base64'))), Buffer.from(bytes));
  native.beginNativeNotesResult(open.sessionId, 0);
  native.finishNativeNotesResult(open.sessionId, {id:'old-id',changed:false,digest:'original'});
  assert.equal((await result).digest, 'original');
});
