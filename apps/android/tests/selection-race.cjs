const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../../harmony/web/src/App.vue'), 'utf8');
const from = source.indexOf('function handleMobileDocumentAreaClick(');
const to = source.indexOf('\nfunction handleEditorKeepIme()', from);
assert(from >= 0 && to > from);
const code = ts.transpileModule(source.slice(from, to), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for (const editAt of ['before-timer', 'before-frame', 'none']) {
 let revision = 0;
 let caret = 0;
 const timers = [];
 const frames = [];
 class Element {
  closest(selector) { return selector.includes('.als-ofs-docx-word-page') ? this : null; }
 }
 const tab = {id:'doc',format:'docx',mobileMode:'editing',editor:{getState:()=>({revision})}};
 const context = vm.createContext({
  Element, mobileLayout:{value:true},androidLayout:true,activeId:{value:'doc'},
  mobileTextEditing:{value:false},document:{activeElement:{}},
  activeDocxEditor:()=>({focus(){}}),isMobileDocumentTextTarget:()=>true,
  window:{setTimeout:callback=>timers.push(callback)},requestAnimationFrame:callback=>frames.push(callback),
  mobileDocxNearestParagraphSelection(){caret=0;},syncMobileImeInset(){},
 });
 vm.runInContext(code,context);
 context.handleMobileDocumentAreaClick({target:new Element(),clientY:80},tab);
 const edit = () => {revision++;caret=1;};
 if(editAt==='before-timer') edit();
 timers[0]();
 if(editAt==='before-frame') edit();
 for(const frame of frames)frame();
 assert.equal(caret,editAt==='none'?0:1,`Blank-area tap must not rewind a newer edit: ${editAt}`);
}
console.log('PASS Android deferred blank-area caret / typing ordering (3 cases)');
