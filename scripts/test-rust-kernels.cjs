const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
		try {
			const p = await browser.newPage();
			p.setDefaultTimeout(30000);
			const warnings = [];
			p.on("console", (m) => {
				if (/kernel unavailable|fall.*JavaScript/i.test(m.text())) warnings.push(m.text());
			});
			await p.goto(process.env.KERNEL_TEST_URL || "http://127.0.0.1:5189/?platform=ios");
			const result = await p.evaluate(
				async (file) => (await import(file)).verifyKernels(),
				"/@fs" + path.resolve(__dirname, "tests/fixtures/rust-kernel-browser.ts"),
			);
			assert.equal(result.assets.length, 11);
			assert.deepEqual(result.images, [
				[40, 80],
				[40, 40],
				[20, 10],
			]);
			assert.equal(result.markdown, "wasm");
			assert.equal(result.pdf, "wasm");
			assert.deepEqual(warnings, []);
			console.log(
				`${engine.name()}: 11 real WASM assets, Rust Markdown/PDF and mobile image rotate/crop/resize passed`,
			);
		} finally {
			await browser.close();
		}
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
