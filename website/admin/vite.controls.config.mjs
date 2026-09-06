import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({define:{"process.env.NODE_ENV":JSON.stringify("production")},build:{outDir:fileURLToPath(new URL('./',import.meta.url)),emptyOutDir:false,lib:{entry:fileURLToPath(new URL('./controls.ts',import.meta.url)),formats:['es'],fileName:()=> 'controls.js',cssFileName:'controls'},rollupOptions:{output:{inlineDynamicImports:true}}}});
