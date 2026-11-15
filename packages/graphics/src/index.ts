import { GRAPHICS_WASM } from "./kernel.generated.js";

type GraphicsExports = WebAssembly.Exports & {
	memory: WebAssembly.Memory;
	graphics_input(length: number): number;
	graphics_output(): number;
	graphics_probe(): number;
	graphics_png(width: number, height: number): number;
	graphics_blend_normal(opacity: number): void;
	graphics_packbits_decode(width: number): number;
	graphics_packbits_encode(): number;
};

let exports: GraphicsExports | undefined;
function graphicsKernel(): GraphicsExports {
	exports ??= new WebAssembly.Instance(
		new WebAssembly.Module(Uint8Array.from(atob(GRAPHICS_WASM), (char) => char.charCodeAt(0))),
	).exports as GraphicsExports;
	return exports;
}

function inputBuffer(kernel: GraphicsExports, length: number): Uint8Array {
	const address = kernel.graphics_input(length);
	if (!address) throw new RangeError("Graphics row exceeds the input budget.");
	return new Uint8Array(kernel.memory.buffer, address, length);
}

function prepare(row: Uint8Array): GraphicsExports {
	const kernel = graphicsKernel();
	inputBuffer(kernel, row.length).set(row);
	return kernel;
}

export function decodeGraphicsPackBits(row: Uint8Array, target: Uint8Array): void {
	const kernel = prepare(row);
	if (kernel.graphics_packbits_decode(target.length) < 0)
		throw new Error(
			"Invalid PackBits row: truncated, incomplete or exceeds the expected width",
		);
	target.set(new Uint8Array(kernel.memory.buffer, kernel.graphics_output(), target.length));
}

export function encodeGraphicsPackBits(row: Uint8Array): Uint8Array {
	const kernel = prepare(row);
	const length = kernel.graphics_packbits_encode();
	return new Uint8Array(kernel.memory.buffer, kernel.graphics_output(), length).slice();
}

/** Match file signatures without allocating or inspecting the rest of the document. */
export function probeGraphicsSource(bytes: Uint8Array): "psd" | "pdf" | "postscript" | null {
	const kernel = prepare(bytes.subarray(0, 8));
	return ([null, "psd", "pdf", "postscript"] as const)[kernel.graphics_probe()] ?? null;
}

export function blendGraphicsNormal(
	source: Uint8ClampedArray,
	target: Uint8ClampedArray,
	opacity: number,
): void {
	const kernel = graphicsKernel();
	// Each transfer is bounded and contains complete RGBA pixels.
	const chunkBytes = 32_764;
	for (let offset = 0; offset < source.length; offset += chunkBytes) {
		const count = Math.min(chunkBytes, source.length - offset);
		const bytes = inputBuffer(kernel, count * 2);
		bytes.set(source.subarray(offset, offset + count));
		bytes.set(target.subarray(offset, offset + count), count);
		kernel.graphics_blend_normal(opacity);
		target.set(bytes.subarray(count), offset);
	}
}

export function encodeGraphicsPng(
	data: Uint8ClampedArray,
	width: number,
	height: number,
): Uint8Array<ArrayBuffer> {
	if (
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		width < 1 ||
		height < 1 ||
		width * height * 4 !== data.length
	) {
		throw new RangeError("PNG dimensions do not match the bitmap.");
	}
	const kernel = graphicsKernel();
	inputBuffer(kernel, data.length).set(data);
	const length = kernel.graphics_png(width, height);
	if (length < 0) throw new Error("Graphics PNG encoding failed.");
	return new Uint8Array(kernel.memory.buffer, kernel.graphics_output(), length).slice();
}
