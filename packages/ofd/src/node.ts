import { svgAtDeviceScale } from "./strokes.js";
import { renderNativeSvg } from "./render-node.js";
import { fileURLToPath } from "node:url";
/** Node-only conversion backend. Never import this entry point into a browser bundle. */
import { PDFDocument } from "pdf-lib";
import { readOfdDocument } from "./read.js";
import { convertDocument, conversionTargets, baseName, selected, rasterSize } from "./convert.js";
import { writeImageOfd, extension, type OfdImagePage } from "./write.js";
import {
	abort,
	blob,
	type ConversionFormat,
	type ConvertOptions,
	type ConversionResult,
} from "./types.js";
export interface NodeConvertOptions extends ConvertOptions {}
async function canvasModule() {
	try {
		return await import("@napi-rs/canvas");
	} catch (error) {
		throw new Error("Image conversion requires the optional @napi-rs/canvas dependency.", {
			cause: error,
		});
	}
}
async function pdfImages(source: Blob, options: NodeConvertOptions): Promise<OfdImagePage[]> {
	const canvas = await canvasModule();
	// PDF.js needs these web geometry globals in a headless process.
	for (const name of ["DOMMatrix", "Path2D", "ImageData"] as const)
		if (!(name in globalThis))
			Object.defineProperty(globalThis, name, { value: canvas[name], configurable: true });
	const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
	abort(options.signal);
	const pdfjsRoot = new URL("../../", import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
	const task = pdfjs.getDocument({
		data: new Uint8Array(await source.arrayBuffer()),
		useSystemFonts: true,
		cMapUrl: fileURLToPath(new URL("cmaps/", pdfjsRoot)),
		cMapPacked: true,
		standardFontDataUrl: fileURLToPath(new URL("standard_fonts/", pdfjsRoot)),
		wasmUrl: fileURLToPath(new URL("wasm/", pdfjsRoot)),
	});
	const onAbort = () => {
		void task.destroy().catch(() => {});
	};
	options.signal?.addEventListener("abort", onAbort, { once: true });
	if (options.signal?.aborted) onAbort();
	try {
		const pdf = await task.promise;
		if (pdf.numPages > (options.maxPages ?? 1000)) throw new RangeError("Too many PDF pages.");
		const indices = selected(
				Array.from({ length: pdf.numPages }, (_, i) => i + 1),
				options.page,
			),
			result: OfdImagePage[] = [];
		for (const index of indices) {
			abort(options.signal);
			const page = await pdf.getPage(index),
				base = page.getViewport({ scale: 96 / 72 });
			const size = rasterSize(base.width, base.height, options),
				surface = canvas.createCanvas(size.width, size.height);
			const viewport = page.getViewport({ scale: (96 / 72) * (options.scale ?? 1.5) });
			await page.render({
				canvas: surface as never,
				canvasContext: surface.getContext("2d") as never,
				viewport,
			}).promise;
			abort(options.signal);
			result.push({
				bytes: surface.toBuffer("image/png"),
				width: base.width,
				height: base.height,
			});
			page.cleanup();
		}
		return result;
	} catch (error) {
		abort(options.signal);
		throw error;
	} finally {
		options.signal?.removeEventListener("abort", onAbort);
		await task.destroy();
	}
}
async function nativeImages(
	source: Blob,
	options: NodeConvertOptions,
): Promise<{ pages: OfdImagePage[]; diagnostics: ConversionResult["diagnostics"] }> {
	const document = await readOfdDocument(source, {
			...options,
			paintScale: options.paintScale ?? (96 / 25.4) * Math.max(2, options.scale ?? 1.5),
		}),
		canvas = await canvasModule(),
		pages: OfdImagePage[] = [];
	for (const page of selected(document.pages, options.page)) {
		abort(options.signal);
		const size = rasterSize(page.width, page.height, options),
			surface = canvas.createCanvas(size.width, size.height);

		const families = new Set(canvas.GlobalFonts.families.map((font) => font.family));
		const fallback =
			[
				"Noto Sans CJK SC",
				"Source Han Sans SC",
				"PingFang SC",
				"Microsoft YaHei",
				"Songti SC",
				"Arial Unicode MS",
			].find((name) => families.has(name)) ?? "sans-serif";
		const rendered = await renderNativeSvg(
			svgAtDeviceScale(
				page.svg,
				Math.min(size.width / page.width, size.height / page.height),
			),
			size.width,
			fallback,
			options.signal,
		);
		abort(options.signal);
		const image = await canvas.loadImage(Buffer.from(rendered));
		surface.getContext("2d").drawImage(image, 0, 0, size.width, size.height);
		pages.push({
			bytes: surface.toBuffer("image/png"),
			width: page.width,
			height: page.height,
		});
	}
	return { pages, diagnostics: document.diagnostics };
}
async function outputImages(
	pages: OfdImagePage[],
	to: "pdf" | "png" | "jpeg",
	options: NodeConvertOptions,
): Promise<ConversionResult> {
	const name = baseName(options);
	if (to === "pdf") {
		const pdf = await PDFDocument.create();
		for (const page of pages) {
			abort(options.signal);
			const image = await pdf.embedPng(page.bytes),
				target = pdf.addPage([page.width * 0.75, page.height * 0.75]);
			target.drawImage(image, {
				x: 0,
				y: 0,
				width: target.getWidth(),
				height: target.getHeight(),
			});
		}
		return {
			files: [{ name: `${name}.pdf`, blob: blob(await pdf.save(), "application/pdf") }],
			diagnostics: [
				{
					code: "raster-pdf",
					message:
						"PDF output preserves rendered pages as images, without selectable text or electronic signatures.",
				},
			],
		};
	}
	const files = [];
	for (let i = 0; i < pages.length; i++) {
		abort(options.signal);
		let bytes = pages[i].bytes;
		if (to === "jpeg") {
			const canvas = await canvasModule(),
				image = await canvas.loadImage(Buffer.from(bytes)),
				surface = canvas.createCanvas(image.width, image.height),
				ctx = surface.getContext("2d");
			ctx.fillStyle = "white";
			ctx.fillRect(0, 0, image.width, image.height);
			ctx.drawImage(image, 0, 0);
			bytes = surface.toBuffer("image/jpeg", Math.round((options.quality ?? 0.92) * 100));
		}
		files.push({
			name: `${name}-${options.page === undefined ? i + 1 : options.page + 1}.${extension(to)}`,
			blob: blob(bytes, `image/${to}`),
		});
	}
	return { files, diagnostics: [] };
}
export async function convertDocumentNode(
	source: Blob,
	from: ConversionFormat,
	to: ConversionFormat,
	options: NodeConvertOptions = {},
): Promise<ConversionResult> {
	abort(options.signal);
	if (source.size > (options.maxSourceBytes ?? 64 * 1024 * 1024))
		throw new RangeError("Source size budget exceeded.");
	if (!conversionTargets[from]?.includes(to))
		throw new Error(`Unsupported conversion: ${from} → ${to}.`);
	const one = (
		data: Blob,
		diagnostics: ConversionResult["diagnostics"] = [],
	): ConversionResult => ({
		files: [{ name: `${baseName(options)}.${extension(to)}`, blob: data }],
		diagnostics,
	});
	if (from === "pdf" && to === "ofd")
		return one(writeImageOfd(await pdfImages(source, options)), [
			{
				code: "raster-ofd",
				message:
					"PDF pages are embedded as images; selectable text and signatures are not preserved.",
			},
		]);
	if ((from === "png" || from === "jpeg") && to === "ofd") {
		selected([source], options.page);
		const canvas = await canvasModule(),
			image = await canvas.loadImage(Buffer.from(await source.arrayBuffer()));
		abort(options.signal);
		rasterSize(image.width, image.height, { ...options, scale: 1 });
		return one(
			writeImageOfd([
				{
					bytes: new Uint8Array(await source.arrayBuffer()),
					width: image.width,
					height: image.height,
				},
			]),
		);
	}
	if (from === "ofd" && (to === "pdf" || to === "png" || to === "jpeg")) {
		const rendered = await nativeImages(source, options),
			result = await outputImages(rendered.pages, to, options);
		result.diagnostics.unshift(...rendered.diagnostics);
		return result;
	}
	return convertDocument(source, from, to, options);
}
export {
	verifyOfdSignaturesNode,
	signOfdDocumentNode,
	nodeOfdDigest,
	rawSignatureVerifier,
} from "./signatures-node.js";
