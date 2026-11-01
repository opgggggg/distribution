import { unzlibSync } from "fflate";
export function rawPng(bytes) {
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let p = 8,
		width = 0,
		height = 0,
		chunks = [];
	while (p + 12 <= bytes.length) {
		const n = v.getUint32(p),
			type = new TextDecoder().decode(bytes.subarray(p + 4, p + 8));
		if (type === "IHDR") {
			width = v.getUint32(p + 8);
			height = v.getUint32(p + 12);
		}
		if (type === "IDAT") chunks.push(bytes.subarray(p + 8, p + 8 + n));
		p += n + 12;
	}
	const data = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0));
	let offset = 0;
	for (const c of chunks) {
		data.set(c, offset);
		offset += c.length;
	}
	const rows = unzlibSync(data),
		stride = width * 4 + 1,
		rgba = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++) {
		if (rows[y * stride] !== 0) throw Error("Fixture PNG filter must be None");
		rgba.set(rows.subarray(y * stride + 1, (y + 1) * stride), y * width * 4);
	}
	return { width, height, rgba: Buffer.from(rgba).toString("base64") };
}
