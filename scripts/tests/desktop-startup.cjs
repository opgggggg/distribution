const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");

// Exercise the built production entry point: successful compilation does not
// detect registry conflicts thrown before the Vue root mounts.
(async () => {
	const root = path.resolve(process.env.DESKTOP_DIST_DIR || "als-office/apps/desktop/dist");
	const server = http.createServer(async (request, response) => {
		try {
			const file = path.join(
				root,
				decodeURIComponent(new URL(request.url, "http://localhost").pathname),
			);
			const target = file.endsWith(path.sep) ? path.join(file, "index.html") : file;
			response.setHeader(
				"Content-Type",
				target.endsWith(".js")
					? "text/javascript"
					: target.endsWith(".css")
						? "text/css"
						: target.endsWith(".html")
							? "text/html"
							: "application/octet-stream",
			);
			response.end(await fs.readFile(target));
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	let browser;
	try {
		browser = await chromium.launch({
			headless: true,
			...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
				? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
				: { channel: "chrome" }),
		});
		const page = await browser.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${server.address().port}`);
		await page
			.waitForFunction(() => document.querySelector("#app")?.childElementCount > 0, null, {
				timeout: 15000,
			})
			.catch((error) => {
				assert.deepEqual(errors, [], "production desktop startup must not throw");
				throw error;
			});
		assert.deepEqual(errors, [], "production desktop startup must not throw");
		assert.ok(
			(await page.locator("body").innerText()).trim().length > 0,
			"desktop shell must render visible content",
		);
		console.log("Production desktop startup: shell mounted without uncaught errors");
	} finally {
		await browser?.close();
		await new Promise((resolve) => server.close(resolve));
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
