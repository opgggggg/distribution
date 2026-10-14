const assert = require("node:assert/strict");
/** Run on an installed debug build in an Android emulator. Install the Playwright
 * Android driver with `npx playwright install android` first. Uses only synthetic files.
 */
const { _android } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
(async () => {
	const device = (await _android.devices()).find(
		(d) => d.serial() === (process.env.ANDROID_TEST_SERIAL || "emulator-5554"),
	);
	if (!device || !device.serial().startsWith("emulator-"))
		throw new Error("An Android emulator is required.");
	const name = "cubeoffice-native-qa-" + Date.now() + ".md",
		path = "/sdcard/Download/" + name;
	await device.push(Buffer.from("# Native original\n"), path);
	const page = await (await device.webView({ pkg: "com.cubexp.office" })).page();
	const button = (name) => page.getByRole("button", { name, exact: true });
	for (let i = 0; i < 8 && (await page.locator(".document-topbar").isVisible()); i++) {
		await button("返回").click();
	}
	await page.locator(".android-open-card").click();
	await device.wait({ pkg: "com.google.android.documentsui" }, { timeout: 15000 });
	await device.tap({ desc: "Search" });
	await device.fill({ res: "com.google.android.documentsui:id/search_src_text" }, name);
	await device.press({ res: "com.google.android.documentsui:id/search_src_text" }, "Enter");
	console.log("Picker search submitted: " + name);
	await device.tap({ text: name, clazz: "android.widget.TextView" });
	await page.locator(".document-topbar__title strong").filter({ hasText: name }).waitFor();
	await button("编辑文档").click();
	const editor = page.locator(".als-ofs-ui-markdown-editor__source-input");
	await editor.fill("# Android native edit\n张三\n");
	await button("更多文档操作").click();
	await button(/保存原文件/).click();
	await page.getByText("原文件已更新", { exact: true }).waitFor();
	assert.match((await device.shell(`cat '${path}'`)).toString(), /Android native edit/);
	console.log("PASS Android provider original writeback");
	await device.push(Buffer.from("# External version must survive\n"), path);
	await editor.fill("# Unsaved after external edit\n");
	await button("更多文档操作").click();
	await button(/保存原文件/).click();
	await page
		.getByRole("alert")
		.filter({ hasText: /其他应用修改/ })
		.waitFor();
	assert.match((await device.shell(`cat '${path}'`)).toString(), /External version/);
	assert.match(await editor.inputValue(), /Unsaved/);
	console.log("PASS Android external conflict and draft retention");
	await button("更多文档操作").click();
	await button("转换、分享与打印").click();
	await button("另存所选格式").click();
	await device.wait({ pkg: "com.google.android.documentsui" }, { timeout: 15000 });
	await device.input.press("Back");
	await page.getByText("操作已取消 · 草稿仍在本机", { exact: true }).waitFor();
	assert.match(await editor.inputValue(), /Unsaved/);
	console.log("PASS Android real picker cancellation");
	await button("更多文档操作").click();
	await button("转换、分享与打印").click();
	await button("分享当前内容").click();
	await page.getByText("已打开系统分享", { exact: true }).waitFor();
	assert.match((await device.shell("dumpsys activity activities")).toString(), /ChooserActivity/);
	await device.shell("am start -n com.cubexp.office/com.yaochn.auroraprimeoffice.MainActivity");
	console.log("PASS Android system share sheet (nothing sent)");
	// Some emulator ADB connections keep handles alive during driver shutdown.
	// All workflow assertions above have finished; bound transport cleanup.
	await Promise.race([device.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
	process.exit(0);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
