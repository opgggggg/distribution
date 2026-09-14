import {readFile,writeFile} from 'node:fs/promises';
const asset=new URL(import.meta.resolve('pdfjs-dist/wasm/qcms_bg.wasm'));
const data=await readFile(asset);
await writeFile(new URL('../src/qcms-data.ts',import.meta.url),'// Generated QCMS WebAssembly, from PDF.js. See LICENSE_QCMS and scripts/build-qcms.mjs.\nexport const QCMS_BASE64: string = '+JSON.stringify(data.toString('base64'))+';\n');
await writeFile(new URL('../LICENSE_QCMS',import.meta.url),(await readFile(new URL('LICENSE_QCMS',asset),'utf8')).replace(/[ \t]+$/gm,''));
