// Requires Playwright via NODE_PATH and the existing private admin credential.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
(async () => {
	const root = path.resolve(__dirname, "../..");
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
		const login = await context.request.post("https://cubexp.com/api/v1/admin/login", {
			data: {
				password: fs
					.readFileSync(path.join(os.homedir(), "cubexp.com/admin/password"), "utf8")
					.trim(),
			},
		});
		assert.equal(login.status(), 200, "admin login succeeds");
		const page = await context.newPage();
		const errors = [];
		const downloads = [];
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("request", (request) => {
			if (/\.(ttf|otf|ttc)(\?|$)/i.test(request.url())) downloads.push(request.url());
		});
		if (process.env.ADMIN_FONT_TEST_LOCAL === "1") {
			await page.route("https://cubexp.com/admin/**", (route) => {
				const pathname = new URL(route.request().url()).pathname;
				const name = pathname === "/admin/" ? "index.html" : path.basename(pathname);
				if (!["index.html", "app.js", "fonts.js", "styles.css"].includes(name))
					return route.continue();
				return route.fulfill({
					path: path.join(root, "website/admin", name),
					contentType: name.endsWith(".html")
						? "text/html"
						: name.endsWith(".css")
							? "text/css"
							: "text/javascript",
				});
			});
			await page.route("https://cubexp.com/fonts/index.json", (route) =>
				route.fulfill({
					path: path.join(root, "website/fonts/index.json"),
					contentType: "application/json",
				}),
			);
		}
		await page.goto("https://cubexp.com/admin/", {
			waitUntil: "domcontentloaded",
			timeout: 60000,
		});
		const rows = page.locator("[data-font-rows] tr");
		await rows.nth(97).waitFor({ timeout: 60000 });
		assert.equal(await rows.count(), 98);
		assert.match(await page.locator("[data-font-summary]").textContent(), /98 个字体样式/);
		await page.locator("[data-font-search]").fill("Arimo");
		assert.equal(await rows.count(), 4);
		assert.ok((await rows.allTextContents()).every((text) => text.includes("Arimo")));
		await page.locator("[data-font-search]").fill("no-such-font-123");
		assert.equal(await rows.count(), 0);
		assert.match(await page.locator("[data-font-status]").textContent(), /没有匹配/);
		await page.locator("[data-font-search]").fill("");
		await page.locator('a[href="#font-library"]').click();
		await page
			.locator("#font-library")
			.screenshot({ path: "/tmp/cubeoffice-admin-fonts-desktop.png" });
		await page.setViewportSize({ width: 390, height: 844 });
		assert.ok(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
			"no page-level mobile overflow",
		);
		await page
			.locator("#font-library")
			.screenshot({ path: "/tmp/cubeoffice-admin-fonts-mobile.png" });
		const fail = (route) => route.fulfill({ status: 503, body: "unavailable" });
		await page.route("https://cubexp.com/fonts/index.json", fail);
		await page.locator("[data-refresh]").click();
		await page.locator("[data-font-retry]").waitFor({ state: "visible" });
		assert.equal(await rows.count(), 0);
		await page.unroute("https://cubexp.com/fonts/index.json", fail);
		await page.locator("[data-font-retry]").click();
		await rows.nth(97).waitFor({ timeout: 60000 });
		assert.deepEqual(downloads, [], "viewing the list does not download font files");
		assert.deepEqual(errors, []);
		console.log(
			"PASS: authenticated font list, 98 faces, search, empty state, mobile layout, failure/retry, no font downloads or browser errors.",
		);
		await context.request.post("https://cubexp.com/api/v1/admin/logout", { data: {} });
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
