/** Whole-app Android performance regression. Run on a freshly launched debug APK.
 * Keeps the five test documents; never clears application data.
 * ADB must be on PATH. Set ANDROID_SERIAL and PLAYWRIGHT_MODULE_PATH as needed.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _android } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const root = path.resolve(__dirname, "../../..");

(async () => {
	const serial = process.env.ANDROID_SERIAL || "emulator-5554";
	const device = (await _android.devices()).find((candidate) => candidate.serial() === serial);
	assert(device, `Connect ${serial} first`);
	try {
		const page = await (await device.webView({ pkg: "com.cubexp.office" })).page();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.getByRole("button", { name: "新建", exact: true }).waitFor();
		assert.equal(
			await page.locator(".harmony-documents__surface").count(),
			0,
			"Start with a freshly launched application so the workload is comparable",
		);
		for (let index = 0; index < 5; index++) {
			const docx = index < 3;
			await page.locator(".android-file-input").setInputFiles({
				name: `性能复测-${index}.${docx ? "docx" : "pptx"}`,
				mimeType: "application/octet-stream",
				buffer: fs.readFileSync(
					path.join(
						root,
						docx
							? "als-office/demo/assets/translation-demo-zh-CN.docx"
							: "website/templates/pptx/meridian.en.pptx",
					),
				),
			});
			await page
				.getByRole("button", { name: "编辑文档", exact: true })
				.click({ trial: true });
			await page.waitForTimeout(1500); // Exclude initial layout/cover work from idle sampling.
			await page.getByRole("button", { name: "返回", exact: true }).click();
			await page.getByRole("button", { name: "新建", exact: true }).waitFor();
		}
		const session = await page.context().newCDPSession(page);
		await session.send("Performance.enable");
		const metrics = async () =>
			Object.fromEntries(
				(await session.send("Performance.getMetrics")).metrics.map((metric) => [
					metric.name,
					metric.value,
				]),
			);
		let before = await metrics();
		await page.waitForTimeout(3000);
		let after = await metrics();
		const idleScriptMs = (after.ScriptDuration - before.ScriptDuration) * 1000;
		const result = {
			idleScriptMs,
			idleTaskMs: (after.TaskDuration - before.TaskDuration) * 1000,
			heapMB: after.JSHeapUsedSize / 1048576,
			nodes: after.Nodes,
		};
		// 5% of one main thread over the sample, generous to slower emulators but
		// catches the former permanent document/context polling (~767ms here).
		assert.ok(
			idleScriptMs < 150,
			`Hidden editors are still busy: ${idleScriptMs.toFixed(1)}ms / 3s`,
		);
		before = await metrics();
		for (let index = 0; index < 6; index++) {
			await page.getByRole("button", { name: "设置", exact: true }).click();
			await page.getByRole("button", { name: "文件", exact: true }).click();
		}
		after = await metrics();
		result.navigationScriptMs = (after.ScriptDuration - before.ScriptDuration) * 1000;
		result.navigationTaskMs = (after.TaskDuration - before.TaskDuration) * 1000;
		assert.deepEqual(errors, []);
		await session.detach();
		console.log("PASS whole-app idle and navigation", JSON.stringify(result, null, 2));
	} finally {
		await device.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
