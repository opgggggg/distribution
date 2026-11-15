import { PsdAiError } from './ai-errors';
import { psdBase64ToBytes, psdBytesToBase64 } from './codec/base64';
import type { PsdBitmap } from './codec/document';

/** Session-owned binary handles. No paths, URLs, or document pixels in model context. */
export class PsdAiResources {
 private entries = new Map<string, {bytes: Uint8Array; received: number; mimeType: string}>();
 private counter = 0;
 private used = 0;
 create(length: number, mimeType = 'application/octet-stream') {
  if (!Number.isSafeInteger(length) || length < 1 || this.used + length > 64 * 1024 * 1024 || this.entries.size >= 64)
   throw new PsdAiError('LimitExceeded', 'Session resources are limited to 64 entries and 64 MiB. Release unused resources.');
  const resourceId = `resource-${++this.counter}`;
  this.entries.set(resourceId, {bytes: new Uint8Array(length), received: 0, mimeType}); this.used += length;
  return {resourceId, length, mimeType};
 }
 put(bytes: Uint8Array, mimeType: string) {
  const result = this.create(bytes.length, mimeType); const entry = this.entry(result.resourceId);
  entry.bytes.set(bytes); entry.received = bytes.length; return result;
 }
 private entry(id: string) {
  const entry = this.entries.get(id);
  if (!entry) throw new PsdAiError('InvalidArgument', 'Unknown or released resource', {path:'resourceId'});
  return entry;
 }
 write(id: string, offset: number, data: string) {
  const entry = this.entry(id), bytes = psdBase64ToBytes(data);
  if (!bytes.length || bytes.length > 48 * 1024 || offset !== entry.received || offset + bytes.length > entry.bytes.length)
   throw new PsdAiError('InvalidArgument', 'Upload chunks must be sequential, at most 48 KiB, and within declared length.');
  entry.bytes.set(bytes, offset); entry.received += bytes.length;
  return {resourceId:id, received:entry.received, complete:entry.received === entry.bytes.length};
 }
 get(id: string) {
  const entry = this.entry(id);
  if (entry.received !== entry.bytes.length) throw new PsdAiError('InvalidArgument', 'Resource upload is incomplete');
  return entry.bytes;
 }
 read(id: string, offset = 0) {
  const bytes = this.get(id);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length) throw new PsdAiError('InvalidArgument', 'Invalid resource offset');
  const part = bytes.subarray(offset, offset + 48 * 1024);
  return {resourceId:id, offset, length:bytes.length, mimeType:this.entry(id).mimeType, dataBase64:psdBytesToBase64(part), nextOffset:offset + part.length, complete:offset + part.length === bytes.length};
 }
 release(id: string) { const entry = this.entries.get(id); if (entry) {this.used -= entry.bytes.length; this.entries.delete(id);} return {released:!!entry}; }
 clear() {this.entries.clear(); this.used = 0;}
}

/** Portable PNG encoder using the platform's standard deflate stream. */
export async function encodePsdPng(bitmap: PsdBitmap): Promise<Uint8Array> {
 const {width, height, data} = bitmap;
 const raw = new Uint8Array(height * (1 + width * 4));
 for (let y=0; y<height; y++) raw.set(data.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 const chunk = (type: string, bytes: Uint8Array) => {
  const out = new Uint8Array(bytes.length+12), view = new DataView(out.buffer);
  view.setUint32(0, bytes.length); out.set(new TextEncoder().encode(type),4); out.set(bytes,8);
  let crc=0xffffffff;
  for (const b of out.subarray(4,out.length-4)) {crc^=b; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  view.setUint32(out.length-4,(crc^0xffffffff)>>>0); return out;
 };
 const header = new Uint8Array(13), view = new DataView(header.buffer);
 view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
 const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())];
 const out = new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;
 for(const part of parts){out.set(part,offset);offset+=part.length;}return out;
}
