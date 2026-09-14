import { zlibSync } from "fflate";
const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
	let c = i;
	for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	table[i] = c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(data.length + 12),
		view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	out.set(new TextEncoder().encode(type), 4);
	out.set(data, 8);
	let crc = 0xffffffff;
	for (let i = 4; i < out.length - 4; i++) crc = table[(crc ^ out[i]) & 255] ^ (crc >>> 8);
	view.setUint32(out.length - 4, (crc ^ 0xffffffff) >>> 0);
	return out;
}
export function rgbaPng(width: number, height: number, pixels: Uint8Array): Uint8Array {
	if (
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		width <= 0 ||
		height <= 0 ||
		width * height > 40000000 ||
		pixels.length !== width * height * 4
	)
		throw new RangeError("Invalid PNG raster dimensions.");
	const header = new Uint8Array(13),
		view = new DataView(header.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	header[8] = 8;
	header[9] = 6;
	const rows = new Uint8Array((width * 4 + 1) * height);
	for (let y = 0; y < height; y++)
		rows.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
	const chunks = [
		new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", header),
		chunk("IDAT", zlibSync(rows)),
		chunk("IEND", new Uint8Array()),
	];
	const result = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
	let offset = 0;
	for (const c of chunks) {
		result.set(c, offset);
		offset += c.length;
	}
	return result;
}
