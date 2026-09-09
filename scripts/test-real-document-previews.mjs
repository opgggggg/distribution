import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const files = [
	`${root}/als-office/demo/assets/translation-demo-zh-CN.docx`,
	`${root}/als-office/packages/pptx/demo/pptx-drawing-test.pptx`,
	`${root}/als-office/packages/pdf/tests/fixtures/ai-readable-sample.pdf`,
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
	const mobile = await browser.newPage({
		viewport: { width: 412, height: 915 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true,
	});
	await mobile.goto("http://127.0.0.1:5187/?platform=android");
	for (const file of files) {
		await mobile.locator(".android-file-input").setInputFiles(file);
		let captured = false;
		for (let attempt = 0; attempt < 90; attempt++) {
			await mobile.waitForTimeout(500);
			captured = await mobile.evaluate(async (name) => {
				const { listHarmonyAutosaves } = await import("/src/autosave-store.ts");
				return (await listHarmonyAutosaves()).some(
					(record) => record.fileName === name && Boolean(record.preview),
				);
			}, file.split("/").pop());
			if (captured) break;
		}
		assert.ok(captured, `No persisted preview for ${file}`);
		await mobile.getByRole("button", { name: "返回", exact: true }).click();
		console.log("Captured", file.split("/").pop());
	}
	await mobile.reload();
	await mobile.locator(".android-file-preview img").first().waitFor();
	assert.equal(await mobile.locator(".android-file-preview img").count(), 3);
	const previews = await mobile.evaluate(async () => {
		const { listHarmonyAutosaves } = await import("/src/autosave-store.ts");
		return (await listHarmonyAutosaves()).map(({ fileName, format, preview, blob }) => ({
			name: fileName,
			format,
			preview,
			size: blob.size,
		}));
	});
	assert.equal(previews.length, 3);
	const ink = await mobile.evaluate(
		async (items) =>
			Promise.all(
				items.map(async (item) => {
					const image = new Image();
					image.src = item.preview;
					await image.decode();
					const canvas = document.createElement("canvas");
					canvas.width = image.width;
					canvas.height = image.height;
					const context = canvas.getContext("2d");
					context.drawImage(image, 0, 0);
					const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
					let count = 0;
					for (let index = 0; index < data.length; index += 4) {
						if (Math.min(data[index], data[index + 1], data[index + 2]) < 180) count++;
					}
					return { name: item.name, ratio: count / (canvas.width * canvas.height) };
				}),
			),
		previews,
	);
	for (const item of ink) assert.ok(item.ratio > 0.005, `Blank preview: ${item.name}`);
	await mobile.screenshot({ path: "/tmp/cubeoffice-mobile-improved.png", fullPage: true });
	await mobile.locator(".android-library-scroll").evaluate((element) => {
		element.scrollTop = 290;
	});
	await mobile.screenshot({ path: "/tmp/cubeoffice-mobile-preview-detail.png" });
	const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	await desktop.goto("http://127.0.0.1:1420/");
	await desktop.locator(".desktop-recent").waitFor();
	await desktop.evaluate(
		async ({ root, files, previews }) => {
			const { createDocumentPreviewCache } = await import(
				`/@fs${root}/als-office/packages/editor-ui/src/document-preview.ts`
			);
			const cache = createDocumentPreviewCache("desktop-recent");
			const recent = [];
			for (const item of previews) {
				const path = files.find((file) => file.endsWith(`/${item.name}`));
				await cache.write(path, item.preview);
				recent.push({
					path,
					name: item.name,
					format: item.format,
					size: item.size,
					openedAt: new Date().toISOString(),
				});
			}
			localStorage.setItem("auroraprime-office.recent-files.v1", JSON.stringify(recent));
			localStorage.removeItem("auroraprime-office.recent-view.v1");
		},
		{ root, files, previews },
	);
	await desktop.reload();
	await desktop.locator(".desktop-recent__preview img").first().waitFor();
	assert.equal(await desktop.locator(".desktop-recent__preview img").count(), 3);
	const rows = await desktop
		.locator(".desktop-recent__gallery li")
		.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
	assert.ok(
		rows.every((top) => top === rows[0]),
		"Gallery must use one continuous row across formats",
	);
	await desktop
		.locator(".desktop-recent")
		.screenshot({ path: "/tmp/cubeoffice-desktop-improved.png" });
	await desktop.screenshot({ path: "/tmp/cubeoffice-desktop-full.png", fullPage: true });
	console.log(
		"PASS: three real documents persisted, restored without reopening, continuous desktop gallery",
	);
} finally {
	await browser.close();
}
