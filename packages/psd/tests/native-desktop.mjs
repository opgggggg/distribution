import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';import UTIF from 'utif';
const root=resolve(import.meta.dirname,'../../..'),binary=join(root,`als-office/apps/desktop/src-tauri/binaries/cubeoffice-ofd-service-${process.arch==='arm64'?'aarch64':'x86_64'}-apple-darwin`);
const temp=mkdtempSync(join(tmpdir(),'psd-native-ipc-')),input=join(temp,'input');mkdirSync(input);
const child=spawn(binary,['--state-dir',join(temp,'state'),'--input-dir',input],{stdio:['pipe','pipe','inherit']});
let serial=0;const waiting=new Map();const lines=createInterface({input:child.stdout});lines.on('line',line=>{const r=JSON.parse(line),w=waiting.get(r.id);if(w){waiting.delete(r.id);clearTimeout(w.timer);r.error?w.reject(Error(r.error)):w.resolve(r.result)}});
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>reject(Error('RPC timeout')),100000);waiting.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+'\n')});}
async function image(bytes,operation){const id=randomBytes(24).toString('hex'),path=join(input,id);writeFileSync(path,bytes);const result=await call('upload.accept',{inputId:id,meta:{kind:'psd-image',operation}});assert.equal(existsSync(path),false);let parts=[],offset=0;while(offset<result.length){const r=await call('psd.image.read',{id:result.id,offset});const b=Buffer.from(r.data,'base64');assert.ok(b.length>0&&b.length<=1048576);parts.push(b);offset+=b.length}const png=Buffer.concat(parts);assert.equal(png.readUInt32BE(0),0x89504e47);await call('psd.image.release',{id:result.id});await assert.rejects(call('psd.image.read',{id:result.id,offset:0}),/Unknown image/);return {png,chunks:parts.length};}
try{
 assert.equal((await call('psd.image.capabilities')).available,true);
 const pixels=randomBytes(1200*1200*4);for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
 const {png,chunks}=await image(Buffer.from(UTIF.encodeImage(pixels,1200,1200)),'decode');assert.ok(chunks>1);assert.equal(png.readUInt32BE(16),1200);console.log('PASS multi-chunk native TIFF decode, 1200 x 1200, chunks='+chunks);
 if(process.argv[2]){const {png}=await image(readFileSync(process.argv[2]),'foreground');console.log('PASS native foreground mask '+png.readUInt32BE(16)+' x '+png.readUInt32BE(20));}
 console.log('PASS result release and upload cleanup');
}finally{child.stdin.end();child.kill();lines.close();for(const w of waiting.values())clearTimeout(w.timer);}
