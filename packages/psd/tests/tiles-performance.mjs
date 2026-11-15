import test from 'node:test';import assert from 'node:assert/strict';import {loadPsd,makeDocument,rasterLayer,solidBitmap} from './helpers.mjs';
const p=await loadPsd();
test('tile rendering matches full composition with groups, masks, clipping and coordinate grain',()=>{
 const base=rasterLayer(p,'base','Base',{bitmap:solidBitmap(p,301,275,35,90,120)});
 const top=rasterLayer(p,'top','Top',{bitmap:solidBitmap(p,80,95,230,20,60,140),left:211,top:171});
 top.mask={left:212,top:172,right:214,bottom:174,data:new Uint8Array([0,80,150,255]),defaultColor:200,disabled:false};top.clipping=true;
 const s=new p.PsdEditorSession(makeDocument(p,[base,top],{width:301,height:275}));
 s.apply([{type:'layer.group',layerIds:['base','top']}]);s.apply([{type:'adjustment.set',adjustment:{kind:'grain',amount:40,size:3,roughness:50,seed:123}}]);
 const doc=s.peekDocument(),full=p.composePsdDocument(doc),cache=new p.PsdTileCache(64,64*64*4*3);
 for(let y=0;y<275;y+=64)for(let x=0;x<301;x+=64){const t=cache.tile(doc,x,y);for(let row=0;row<t.bitmap.height;row++)assert.deepEqual(t.bitmap.data.slice(row*t.bitmap.width*4,(row+1)*t.bitmap.width*4),full.data.slice(((y+row)*301+x)*4,((y+row)*301+x+t.bitmap.width)*4));assert.ok(cache.residentBytes<=cache.budgetBytes);}
});
test('local edits preserve untouched tiles and invalidate old/new moved coverage',()=>{
 const base=rasterLayer(p,'b','Base',{bitmap:solidBitmap(p,512,256,20,20,20)}),l=rasterLayer(p,'l','Top',{bitmap:solidBitmap(p,8,8,255,0,0),left:10,top:10});
 const doc=makeDocument(p,[base,l],{width:512,height:256}),cache=new p.PsdTileCache(128);
 const left=cache.tile(doc,0,0).bitmap,right=cache.tile(doc,384,0).bitmap;
 const changed={...doc,layers:[base,{...l,left:150}]};
 assert.equal(cache.tile(changed,384,0).bitmap,right);assert.notEqual(cache.tile(changed,0,0).bitmap,left);assert.equal(cache.tile(changed,128,0).bitmap.data[(10*128+22)*4],255);
});
if(process.argv.includes('--benchmark')){
 const doc=makeDocument(p,[rasterLayer(p,'base','Base',{bitmap:solidBitmap(p,4096,4096,30,80,100)})],{width:4096,height:4096});
 const cache=new p.PsdTileCache(256,16*1024*1024), times=[];const start=performance.now();
 for(let y=0;y<1024;y+=256)for(let x=0;x<1024;x+=256){const a=performance.now();cache.tile(doc,x,y);times.push(performance.now()-a);}
 const cold=performance.now()-start,warmStart=performance.now();for(let y=0;y<1024;y+=256)for(let x=0;x<1024;x+=256)cache.tile(doc,x,y);
 console.log(JSON.stringify({canvas:'4096x4096',viewport:'1024x1024',coldMs:cold,warmMs:performance.now()-warmStart,maxTileMs:Math.max(...times),cacheBytes:cache.residentBytes,fullCompositeBytes:4096*4096*4}));
}
