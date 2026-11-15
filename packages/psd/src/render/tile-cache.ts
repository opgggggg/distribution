import {createPsdBitmap, type PsdBitmap, type PsdDocument, type PsdLayerNode} from "../codec/document";
import {composeLayers} from "./compose";
export interface PsdTileRegion {x:number;y:number;width:number;height:number}
function shifted(layers:readonly PsdLayerNode[], x:number,y:number):PsdLayerNode[]{
 return layers.map(layer=>{
  const mask=layer.mask ? {...layer.mask,left:layer.mask.left-x,right:layer.mask.right-x,top:layer.mask.top-y,bottom:layer.mask.bottom-y}:undefined;
  return layer.kind === "group" ? {...layer,mask,children:shifted(layer.children,x,y)} : {...layer,mask,left:layer.left-x,top:layer.top-y};
 });
}
export function composePsdRegion(document:PsdDocument, region:PsdTileRegion):PsdBitmap{
 const {x,y,width,height}=region;
 if (![x,y,width,height].every(Number.isInteger)||x<0||y<0||width<1||height<1||x+width>document.width||y+height>document.height) throw Error("Invalid composition region");
 const out=createPsdBitmap(width,height);
 if (!document.editable && document.composite){
  for(let row=0;row<height;row++)out.data.set(document.composite.data.subarray(((row+y)*document.width+x)*4,((row+y)*document.width+x+width)*4),row*width*4);
 }else composeLayers(out,shifted(document.layers,x,y),{originX:x,originY:y});
 return out;
}
// Cache dependency tokens must not retain old full-resolution pixel buffers.
const identities = new WeakMap<object, number>();
let nextIdentity = 1;
function identity(value: object | null | undefined): number {
 if (!value) return 0;
 let token = identities.get(value);
 if (token === undefined) { token = nextIdentity++; identities.set(value, token); }
 return token;
}
function signature(document:PsdDocument,r:PsdTileRegion):unknown[]{
 const out:unknown[]=[document.width,document.height,document.editable,identity(document.composite)];
 function visit(layers:readonly PsdLayerNode[]){
  for(const l of layers){
   if(!l.visible)continue;
   const relevant=l.kind==='group'||l.curves||l.adjustment||(l.left<r.x+r.width&&l.left+l.bitmap.width>r.x&&l.top<r.y+r.height&&l.top+l.bitmap.height>r.y);
   if(!relevant){out.push(l.id,'outside',l.clipping);continue;}
   out.push(l.id,l.kind,l.opacity,l.blendMode,l.clipping);
   if(l.mask)out.push(identity(l.mask.data),l.mask.left,l.mask.top,l.mask.right,l.mask.bottom,l.mask.disabled,l.mask.defaultColor);else out.push(null);
   if(l.kind==='group'){visit(l.children);out.push('end');}
   else out.push(identity(l.bitmap.data),l.bitmap.width,l.bitmap.height,l.left,l.top,JSON.stringify(l.curves),JSON.stringify(l.adjustment));
  }
 }
 visit(document.layers);return out;
}
/** LRU cache with per-tile dependency checks; unchanged tiles survive local edits and undo. */
export class PsdTileCache{
 private entries=new Map<string,{signature:unknown[];bitmap:PsdBitmap}>();
 private bytes=0;
 hits=0; misses=0;
 constructor(readonly tileSize=256,readonly budgetBytes=64*1024*1024){if(!Number.isInteger(tileSize)||tileSize<16||tileSize>1024||budgetBytes<tileSize*tileSize*4)throw Error('Invalid tile cache budget');}
 get residentBytes(){return this.bytes}
 clear(){this.entries.clear();this.bytes=0;}
 tile(document:PsdDocument,x:number,y:number):{region:PsdTileRegion;bitmap:PsdBitmap}{
  const region={x,y,width:Math.min(this.tileSize,document.width-x),height:Math.min(this.tileSize,document.height-y)};
  const key=`${x}:${y}`,sig=signature(document,region),old=this.entries.get(key);
  if(old&&old.signature.length===sig.length&&sig.every((v,i)=>v===old.signature[i])){this.entries.delete(key);this.entries.set(key,old);this.hits++;return {region,bitmap:old.bitmap};}
  if(old){this.entries.delete(key);this.bytes-=old.bitmap.data.byteLength;}
  const bitmap=composePsdRegion(document,region);this.misses++;
  while(this.bytes+bitmap.data.byteLength>this.budgetBytes&&this.entries.size){const first=this.entries.keys().next().value!;this.bytes-=this.entries.get(first)!.bitmap.data.byteLength;this.entries.delete(first);}
  this.entries.set(key,{signature:sig,bitmap});this.bytes+=bitmap.data.byteLength;
  return {region,bitmap};
 }
}
