const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const messages = [];
const window = { webkit: { messageHandlers: { auroraHost: { postMessage: message => messages.push(message) } } },
 dispatchEvent() {}, crypto: { randomUUID: () => 'test-' + messages.length } };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../App/Resources/bridge.js'), 'utf8'), {
 window, Uint8Array, Promise, Error, Date, Math, JSON, Object, String, Event: class Event {},
 btoa: value => Buffer.from(value,'binary').toString('base64'), atob: value => Buffer.from(value,'base64').toString('binary')
});
(async()=>{
 const host = window.auroraHarmonyHost, native = window.__auroraIosHost;
 const id = host.beginSave('draft.pdf');assert(host.appendSaveChunk(id,'Ynl0ZXM='));
 let finished=false;const pending=host.finishFileOperation(id,'export','null').then(result=>{finished=true;return JSON.parse(result)});
 await Promise.resolve();assert.equal(finished,false,'opening a native picker is not a save receipt');
 assert.equal(messages.at(-1).name,'finishFileOperation');
 native.settleFileResult(id,JSON.stringify({status:'cancelled'}));assert.equal((await pending).status,'cancelled');
 const failureId=host.beginSave('draft.pdf');const failed=host.finishFileOperation(failureId,'save',JSON.stringify({id:'original',version:'before'}));
 native.settleSave(failureId,false,'Provider failed');await assert.rejects(failed,/Provider failed/);
 native.beginStagedDocument('open',5);native.stageDocumentChunk('open',Buffer.from('bytes').toString('base64'));
 native.commitStagedDocument('open','test.md','text/markdown',{id:'reference',name:'test.md',writable:true,version:'hash'});
 const descriptor=JSON.parse(host.consumePendingIntent());assert.equal(descriptor.source.id,'reference');assert.equal(descriptor.source.version,'hash');
 assert.equal(Buffer.from(host.readOpenDocumentChunk('open',1,3),'base64').toString(),'yte');assert(host.finishOpenDocument('open'));
 const a=host.beginSave('a.pdf'),b=host.beginSave('b.png');const shared=host.finishShareFiles(JSON.stringify([a,b]));
 assert.deepEqual([...messages.at(-1).ids],[a,b]);native.settleFileResult(a,JSON.stringify({status:'shared'}));assert.equal(JSON.parse(await shared).status,'shared');
 console.log('PASS iOS final receipts, provider failure, persistent source metadata, chunk integrity and batch share');
})().catch(error=>{console.error(error);process.exitCode=1});
