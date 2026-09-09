import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
	const page = await browser.newPage();
	await page.route("**/preview-check", (route) =>
		route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }),
	);
	await page.goto("http://127.0.0.1:5187/preview-check");
	const result = await page.evaluate(async () => {
		const { captureDocumentPreview } = await import("/src/document-preview.ts");
		const store = await import("/src/autosave-store.ts");
		// API readiness may arrive before the page. Never cache the empty stage.
		document.body.innerHTML =
			'<section id="late" style="width:800px;height:450px"><div data-workspace-region="stage"></div></section>';
		const pending = captureDocumentPreview(document.querySelector("#late"));
		setTimeout(() => {
			document.querySelector("#late").innerHTML =
				'<div id="viewer"><div class="als-ofs-pptx-slide" style="width:800px;height:450px;background:red">Ready</div></div>';
		}, 450);
		const delayed = new Image();
		delayed.src = await pending;
		await delayed.decode();
		if (delayed.width !== 480 || delayed.height !== 270)
			throw new Error("Captured loading shell instead of delayed slide");
		document.body.innerHTML =
			'<section id="continuous"><div class="als-ofs-docx-word-page" data-word-page-id="word-web-page" style="width:800px;height:16000px;background:red">First screen</div></section>';
		const continuous = new Image();
		continuous.src = await captureDocumentPreview(document.querySelector("#continuous"));
		await continuous.decode();
		if (continuous.width !== 480 || continuous.height !== 672)
			throw new Error("Shrank entire Word web layout instead of first screen");
		document.body.innerHTML =
			'<section id="surface"><div id="viewer"><div class="als-ofs-pptx-slide" style="width:800px;height:450px;background:rgb(255,0,0)">First slide</div><div class="als-ofs-pptx-slide" style="width:800px;height:450px;background:blue">Second slide</div></div></section>';
		const preview = await captureDocumentPreview(document.querySelector("#surface"));
		const image = new Image();
		image.src = preview;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext("2d");
		context.drawImage(image, 0, 0);
		const pixel = [...context.getImageData(120, 70, 1, 1).data];
		const slide = document.querySelector(".als-ofs-pptx-slide");
		const rendered = document.createElement("canvas");
		rendered.dataset.editorModelCanvas = "true";
		rendered.width = 800;
		rendered.height = 450;
		rendered.getContext("2d").fillStyle = "#00ff00";
		rendered.getContext("2d").fillRect(0, 0, 800, 450);
		slide.prepend(rendered);
		const canvasPreview = await captureDocumentPreview(document.querySelector("#surface"));
		image.src = canvasPreview;
		await image.decode();
		context.drawImage(image, 0, 0);
		const canvasPixel = [...context.getImageData(120, 70, 1, 1).data];
		const record = {
			id: "preview-test",
			fileName: "deck.pptx",
			format: "pptx",
			blob: new Blob(["original"]),
			savedAt: 1,
			preview,
		};
		await store.ensureHarmonyRecent(record);
		await store.writeHarmonyAutosave({ ...record, blob: new Blob(["edited"]), savedAt: 2 });
		await store.ensureHarmonyRecent(record);
		await store.updateHarmonyPreview(record.id, preview);
		document.body.innerHTML = "";
		const cached = (await store.listHarmonyAutosaves()).find((item) => item.id === record.id);
		const answer = {
			width: image.width,
			pixel,
			canvasPixel,
			unchanged: cached.preview === preview,
			contents: await cached.blob.text(),
			date: cached.savedAt,
		};
		await store.deleteHarmonyAutosave(record.id);
		return answer;
	});
	assert.equal(result.width, 480);
	assert.ok(result.pixel[0] > 240 && result.pixel[2] < 20, "capture must use first slide");
	assert.equal(result.unchanged, true, "preview must survive without the editor DOM");
	assert.ok(
		result.canvasPixel[1] > 240 && result.canvasPixel[0] < 20,
		"reuse the rendered canvas when present",
	);
	assert.equal(result.contents, "edited", "opening must not replace an existing draft");
	assert.equal(result.date, 2);
	console.log("PASS: first-slide capture, cached preview, draft preservation");
} finally {
	await browser.close();
}
