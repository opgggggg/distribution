const assert = require("node:assert/strict"),
	{ chromium } = require("playwright");
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		for (const [width, height] of [
			[1024, 768],
			[1280, 840],
		]) {
			const snapshots = [];
			for (const platform of ["ios", "harmonyos"]) {
				const p = await browser.newPage({ viewport: { width, height }, hasTouch: true });
				const errors = [];
				p.on("pageerror", (e) => errors.push(e.message));
				await p.addInitScript(() =>
					localStorage.setItem("cubeoffice.privacy.consent", "2026-09-07"),
				);
				await p.goto("http://127.0.0.1:5179/?platform=" + platform);
				await p.locator(".android-library").waitFor();
				assert.equal(await p.locator(".harmony-chrome").count(), 0);
				const geometry = async (selectors) =>
					p.evaluate(
						(selectors) =>
							Object.fromEntries(
								selectors.map((s) => {
									const e = document.querySelector(s),
										r = e.getBoundingClientRect();
									return [s, [r.x, r.y, r.width, r.height]];
								}),
							),
						selectors,
					);
				const home = await geometry([
					".android-topbar",
					".android-library",
					".android-navigation",
					".android-fab",
				]);
				await p.screenshot({
					path: `.cache/notes-qa/tablet-${platform}-home-${width}.png`,
				});
				await p.getByRole("button", { name: "新建", exact: true }).click();
				await p.locator(".android-sheet button").filter({ hasText: "手写笔记" }).click();
				await p.locator(".cube-notes.is-writing .cube-notes__ink-canvas").waitFor();
				assert.equal(
					await p.locator(".cube-notes__nav").count(),
					0,
					"tablet notes have no desktop bottom toolbar",
				);
				assert.equal(
					await p.locator(".cube-notes__sidebar").count(),
					0,
					"pages start collapsed",
				);
				const writing = await geometry([
					".android-topbar",
					".cube-notes__viewport",
					".cube-notes__tool-tray",
				]);
				const view = await p.locator(".cube-notes__viewport").boundingBox(),
					tray = await p.locator(".cube-notes__tool-tray").boundingBox();
				assert.ok(view.height >= height - 1);
				assert.ok(
					tray.y > height / 2 && tray.y + tray.height <= height,
					"iPad pen panel floats above the bottom",
				);
				await p.screenshot({
					path: `.cache/notes-qa/tablet-${platform}-writing-${width}.png`,
				});
				await p.mouse.move(100, 120);
				await p.mouse.down();
				await p.mouse.move(300, 145, { steps: 12 });
				await p.mouse.up();
				await p.evaluate(async () => {
					if (!(await window.auroraPrepareForClose()))
						throw Error("Draft close preparation failed");
				});
				await p.evaluate(() => {
					const original = IDBObjectStore.prototype.put;
					window.qaRestorePut = () => (IDBObjectStore.prototype.put = original);
					IDBObjectStore.prototype.put = function () {
						throw new DOMException("QA storage full", "QuotaExceededError");
					};
				});
				await p.mouse.move(100, 210);
				await p.mouse.down();
				await p.mouse.move(300, 230, { steps: 12 });
				await p.mouse.up();
				const rejected = await p.evaluate(async () => {
					const ready = await window.auroraPrepareForClose();
					window.qaRestorePut();
					return ready;
				});
				assert.equal(rejected, false, "a failed local draft prevents window close");
				assert.equal(
					await p.evaluate(() => window.auroraPrepareForClose()),
					true,
					"close succeeds after storage recovers",
				);
				const drafts = await p.evaluate(async () => {
					const { listHarmonyAutosaves } = await import("/src/autosave-store.ts");
					return (await listHarmonyAutosaves()).map((x) => ({
						fileName: x.fileName,
						bytes: x.blob.size,
					}));
				});
				assert.ok(
					drafts.some((x) => x.fileName.endsWith(".cubenote") && x.bytes > 500),
					"2in1 shares local draft persistence",
				);
				await p.locator(".android-topbar .android-notes-pages").click();
				await p.locator(".cube-notes__sidebar").waitFor();
				await p.locator(".android-topbar .android-notes-pages").click();
				await p.getByRole("button", { name: "完成书写", exact: true }).click();
				await p
					.locator(".android-topbar")
					.getByRole("button", { name: "返回", exact: true })
					.click();
				await p.locator(".cube-notes[data-readonly=true]").waitFor();
				assert.equal(await p.locator(".cube-notes__tool-tray").count(), 0);
				const reading = await geometry([".android-topbar", ".cube-notes__viewport"]);
				await p.locator(".android-topbar .android-notes-pages").click();
				await p.locator(".cube-notes__sidebar").waitFor();
				snapshots.push({ home, writing, reading });
				assert.deepEqual(errors, []);
				await p.close();
			}
			assert.deepEqual(
				snapshots[1],
				snapshots[0],
				"Harmony tablet shell matches the iPad components and geometry",
			);
		}
		console.log(
			"PASS: iPad/Harmony homepage, writing and reading geometry; pen tray; pages in both modes; local drafts and safe close",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
