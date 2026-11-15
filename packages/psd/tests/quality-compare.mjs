import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {loadPsd,makeDocument,rasterLayer} from './helpers.mjs';
const p=await loadPsd(),here=dirname(fileURLToPath(import.meta.url)),temp=mkdtempSync(join(tmpdir(),'psd-quality-'));
const ref=join(here,'reference'),lib=join(temp,'oracle.dylib'),swift=join(temp,'blend');
execFileSync('cc',['-shared','-fPIC','-O2',...['AdjustPixels.c','LensPixels.c','NoisePixels.c'].map(n=>join(ref,'compositor',n)),'-lm','-o',lib]);
execFileSync('xcrun',['swiftc','-O',join(ref,'BlendOracle.swift'),'-o',swift]);
function premul(bitmap){const data=Buffer.from(bitmap.data);for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++)data[i+c]=Math.round(data[i+c]*data[i+3]/255);return data;}
function fixture(alpha,phase=0){const b=p.createPsdBitmap(64,64);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4;b.data.set([(x*7+phase)%256,(y*9+phase)%256,((x+y)*5+phase)%256,alpha?[0,64,128,255][(x+y)%4]:255],i);}return b;}
function metrics(actual,expected){let sum=0,max=0,squares=0,count=0,over=0;for(let i=0;i<actual.length;i++){const d=Math.abs(actual[i]-expected[i]);sum+=d;squares+=d*d;max=Math.max(max,d);count++;if(d>2)over++;}return {mae:+(sum/count).toFixed(4),rmse:+Math.sqrt(squares/count).toFixed(4),max,over2Percent:+(over/count*100).toFixed(3)};}
const rows=[];
for(const alpha of [false,true]){
 const bitmap=fixture(alpha),data=premul(bitmap).toString('base64');
 for(const settings of [{operation:'grain',amount:40,size:2.5,roughness:55,seed:17},{operation:'lens',distortion:-55},{operation:'noise',strength:30,seed:17},{operation:'gradient-map',table:Array.from({length:768},(_,i)=>Math.floor(i/3))}]){
  const expected=Buffer.from(execFileSync('python3',[join(ref,'oracle.py'),lib],{input:JSON.stringify({...settings,data,width:64,height:64}),encoding:'utf8'}).trim(),'base64');
  let actual;
  if(settings.operation==='grain')actual=p.applyGrain(bitmap,{kind:'grain',...settings});
  else if(settings.operation==='noise')actual=p.applyNoise(bitmap,30,17);
  else {const s=new p.PsdEditorSession(makeDocument(p,[rasterLayer(p,'L','Test',{bitmap})],{width:64,height:64}));
   if(settings.operation==='lens')s.apply([{type:'filter.apply',layerId:'L',kind:'lens-correction',params:{distortion:-55}}]);
   else s.apply([{type:'adjustment.set',adjustment:{kind:'gradient-map',reverse:false,stops:[{position:0,midpoint:.5,color:{r:0,g:0,b:0}},{position:1,midpoint:.5,color:{r:255,g:255,b:255}}]}}]);
   actual=settings.operation==='lens'?s.peekDocument().layers[0].bitmap:p.composePsdDocument(s.peekDocument());}
  rows.push({operation:settings.operation,alpha,...metrics(premul(actual),expected)});
 }
 for(const mode of ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','soft-light','hard-light','difference','exclusion','hue','saturation','color','luminosity','gaussian','motion']){
  const target=fixture(alpha,41),source=fixture(alpha,73);
  const expected=Buffer.from(execFileSync(swift,[],{input:JSON.stringify({width:64,height:64,mode,source:premul(source).toString('base64'),backdrop:premul(target).toString('base64')}),encoding:'utf8'}).trim(),'base64');
  let actual=target;
  if(mode==='gaussian')actual=p.applyGaussianBlur(source,3);
  else if(mode==='motion')actual=p.applyFilter(source,'motion-blur',{distance:12,angle:0});
  else p.blendOver(actual,{bitmap:source,left:0,top:0,opacity:1,blendMode:mode});
  rows.push({operation:mode,alpha,...metrics(premul(actual),expected)});
 }
}
// Apple CG/CI uses different soft-light and working-space blend semantics.
// Keep these visible as known differences, rather than asserting equivalence.
const knownDifferences = new Set(['soft-light','color-dodge','color-burn']);
for (const row of rows) {
 row.status = knownDifferences.has(row.operation) ? 'known-semantic-difference' : 'within-tolerance';
 if (!knownDifferences.has(row.operation)) {
  const nonseparable = ['hue','saturation','color','luminosity'].includes(row.operation);
  assert.ok(row.max <= (nonseparable ? 8 : 2), `${row.operation} alpha=${row.alpha}: max error ${row.max}`);
  assert.ok(row.mae <= (nonseparable ? 0.6 : 0.4), `${row.operation} alpha=${row.alpha}: MAE ${row.mae}`);
 }
}
const output=process.argv[2]??join(temp,'quality-results.json');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({reference:'Compositor a19db90',fixture:'64x64 RGB ramps; opaque and 0/64/128/255 alpha; premultiplied 8-bit comparison',rows},null,2)+'\n');
console.table(rows);console.log(output);
