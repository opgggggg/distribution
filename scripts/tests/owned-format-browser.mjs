import { createServer } from "vite";
import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const server = await createServer({
	configFile: false,
	root,
	server: { host: "127.0.0.1", port: 0 },
	optimizeDeps: {
		noDiscovery: true,
		entries: [],
		include: [
			"fflate",
			"pdf-lib",
			"@codemirror/state",
			"highlight.js/lib/common",
			"@xmldom/xmldom",
		],
		exclude: ["@cubexp/kernels", "@cubexp/text", "@cubexp/epub"],
	},
});
await server.listen();
try {
	const address = server.httpServer.address();
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch();
		try {
			const page = await browser.newPage();
			const warnings = [];
			page.on("pageerror", (e) => warnings.push(e.message));
			await page.goto(
				`http://127.0.0.1:${address.port}/scripts/tests/fixtures/owned-format-test.html`,
			);
			const result = await page.evaluate(async () => {
				const module = "/scripts/tests/fixtures/owned-format-kernels.ts";
				return (await import(module)).verifyOwnedFormats();
			});
			assert.deepEqual(result, {
				kernel: "rust",
				text: true,
				epub: true,
				search: true,
				ofd: true,
				writers: true,
				signatures: true,
				render: true,
				codecs: true,
				tiffPages: true,
				mobilePdf: true,
			});
			assert.deepEqual(warnings, []);
			console.log(
				`${engine.name()}: real Rust WASM text/history/concurrent save/EPUB/search/OFD package/binary edits/cold synchronous writers/signatures/page pixels/provider recovery/86 image codecs/multi-page image previews/mobile PDF mutations passed`,
			);
		} finally {
			await browser.close();
		}
	}
} finally {
	await server.close();
}
