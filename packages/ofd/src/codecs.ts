import UTIF from "utif";
import { rgbaPng } from "./raster.js";
import { Archive, attr, children, descendants, first, resolvePath, rasterMime } from "./archive.js";
import { documentPath } from "./package.js";
import { abort, type ReadOptions } from "./types.js";
function dimensions(width: number, height: number): void {
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width <= 0 ||
		height <= 0 ||
		width * height > 40000000 ||
		width > 20000 ||
		height > 20000
	)
		throw new RangeError("Image exceeds the OFD pixel budget.");
}
export function decodeBmp(bytes: Uint8Array): Uint8Array {
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
		u16 = (n: number) => v.getUint16(n, true),
		u32 = (n: number) => v.getUint32(n, true);
	if (bytes.length < 26 || bytes[0] !== 66 || bytes[1] !== 77)
		throw new Error("Invalid BMP header.");
	const offset = u32(10),
		header = u32(14),
		core = header === 12;
	if (!core && header < 40) throw new Error("Unsupported BMP DIB header.");
	const width = core ? u16(18) : v.getInt32(18, true),
		signedHeight = core ? u16(20) : v.getInt32(22, true),
		height = Math.abs(signedHeight),
		depth = u16(core ? 24 : 28),
		compression = core ? 0 : u32(30);
	dimensions(width, height);
	if (
		![1, 4, 8, 16, 24, 32].includes(depth) ||
		![0, 1, 2, 3, 6].includes(compression) ||
		(compression === 1 && depth !== 8) ||
		(compression === 2 && depth !== 4)
	)
		throw new Error("Unsupported BMP encoding.");
	let paletteOffset = 14 + header;
	let masks = depth === 16 ? [0x7c00, 0x3e0, 0x1f, 0] : [0xff0000, 0xff00, 0xff, 0];
	if (compression === 3 || compression === 6) {
		masks = [u32(54), u32(58), u32(62), header >= 56 || compression === 6 ? u32(66) : 0];
		if (header === 40) paletteOffset += compression === 6 ? 16 : 12;
	}
	const palette: number[][] = [];
	if (depth <= 8) {
		const count = core ? 1 << depth : u32(46) || 1 << depth,
			size = core ? 3 : 4;
		if (count > 256 || paletteOffset + count * size > offset)
			throw new Error("Invalid BMP palette.");
		for (let i = 0; i < count; i++) {
			const p = paletteOffset + i * size;
			palette.push([bytes[p + 2], bytes[p + 1], bytes[p], 255]);
		}
	}
	const pixels = new Uint8Array(width * height * 4);
	for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
	const put = (x: number, y: number, rgba: number[]) => {
		if (x < 0 || x >= width || y < 0 || y >= height)
			throw new Error("BMP pixel is outside its image.");
		pixels.set(rgba, ((signedHeight > 0 ? height - 1 - y : y) * width + x) * 4);
	};
	const indexed = (index: number) => {
		if (!palette[index]) throw new Error("Invalid BMP palette index.");
		return palette[index];
	};
	if (compression === 1 || compression === 2) {
		let p = offset,
			x = 0,
			y = 0;
		while (p < bytes.length) {
			const count = bytes[p++],
				value = bytes[p++];
			if (value === undefined) throw new Error("Truncated BMP run.");
			if (count) {
				for (let i = 0; i < count; i++)
					put(
						x++,
						y,
						indexed(compression === 1 ? value : i % 2 ? value & 15 : value >> 4),
					);
			} else if (value === 0) {
				x = 0;
				y++;
			} else if (value === 1) break;
			else if (value === 2) {
				x += bytes[p++];
				y += bytes[p++];
			} else {
				const n = value,
					size = compression === 1 ? n : Math.ceil(n / 2);
				if (p + size > bytes.length) throw new Error("Truncated BMP literal run.");
				for (let i = 0; i < n; i++)
					put(
						x++,
						y,
						indexed(
							compression === 1
								? bytes[p + i]
								: i % 2
									? bytes[p + (i >> 1)] & 15
									: bytes[p + (i >> 1)] >> 4,
						),
					);
				p += size + (size & 1);
			}
		}
	} else {
		const stride = Math.ceil((width * depth) / 32) * 4;
		if (offset + stride * height > bytes.length) throw new Error("Truncated BMP pixel data.");
		const component = (value: number, mask: number, fallback = 0) => {
			if (!mask) return fallback;
			let shift = 0;
			while (((mask >>> shift) & 1) === 0) shift++;
			const maximum = mask >>> shift;
			return Math.round((((value & mask) >>> shift) * 255) / maximum);
		};
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++) {
				const p = offset + y * stride + Math.floor((x * depth) / 8);
				let rgba: number[];
				if (depth <= 8) {
					const shift = 8 - depth - ((x * depth) % 8);
					rgba = indexed((bytes[p] >> shift) & ((1 << depth) - 1));
				} else if (depth === 24) rgba = [bytes[p + 2], bytes[p + 1], bytes[p], 255];
				else {
					const value = depth === 16 ? u16(p) : u32(p);
					rgba = [
						component(value, masks[0]),
						component(value, masks[1]),
						component(value, masks[2]),
						component(value, masks[3], 255),
					];
				}
				put(x, y, rgba);
			}
	}
	return rgbaPng(width, height, pixels);
}
export function decodeTiff(bytes: Uint8Array): Uint8Array {
	const buffer = bytes.slice().buffer,
		images = UTIF.decode(buffer);
	if (images.length !== 1) throw new Error("OFD TIFF resources must contain exactly one image.");
	const image = images[0];
	dimensions(image.t256?.[0] ?? 0, image.t257?.[0] ?? 0);
	UTIF.decodeImage(buffer, image);
	const rgba = UTIF.toRGBA8(image),
		orientation = image.t274?.[0] ?? 1;
	if (orientation === 1) return rgbaPng(image.width, image.height, rgba);
	if (!Number.isInteger(orientation) || orientation < 1 || orientation > 8)
		throw new Error("Invalid TIFF orientation.");
	const width = orientation >= 5 ? image.height : image.width,
		height = orientation >= 5 ? image.width : image.height,
		output = new Uint8Array(rgba.length);
	for (let y = 0; y < image.height; y++)
		for (let x = 0; x < image.width; x++) {
			const [dx, dy] =
				orientation === 2
					? [image.width - 1 - x, y]
					: orientation === 3
						? [image.width - 1 - x, image.height - 1 - y]
						: orientation === 4
							? [x, image.height - 1 - y]
							: orientation === 5
								? [y, x]
								: orientation === 6
									? [image.height - 1 - y, x]
									: orientation === 7
										? [image.height - 1 - y, image.width - 1 - x]
										: [y, image.width - 1 - x];
			output.set(
				rgba.subarray((y * image.width + x) * 4, (y * image.width + x + 1) * 4),
				(dy * width + dx) * 4,
			);
		}
	return rgbaPng(width, height, output);
}
/** Resolve only resources reachable from a selected document; attachments are not decoded. */
export async function prepareImages(archive: Archive, options: ReadOptions): Promise<Set<string>> {
	const visited = new Set<string>(),
		resources = new Set<string>(),
		bodies = children(archive.xml("OFD.xml"), "DocBody");
	function visit(path: string): void {
		if (visited.has(path) || !archive.files[path]) return;
		visited.add(path);
		const root = archive.xml(path);
		for (const name of ["PublicRes", "DocumentRes", "PageRes"])
			for (const ref of descendants(root, name))
				resources.add(resolvePath(path, ref.textContent?.trim() ?? ""));
		for (const ref of [...descendants(root, "Page"), ...descendants(root, "TemplatePage")])
			if (ref.hasAttribute("BaseLoc")) visit(resolvePath(path, attr(ref, "BaseLoc")));
	}
	for (const body of options.documentIndex === undefined
		? bodies
		: bodies.slice(options.documentIndex, options.documentIndex + 1))
		visit(documentPath(archive, body, options.version));
	const decoded = new Set<string>();
	for (const path of resources) {
		if (!archive.files[path]) continue;
		const root = archive.xml(path),
			base = attr(root, "BaseLoc");
		for (const media of descendants(root, "MultiMedia")) {
			if (attr(media, "Type", "Image") !== "Image") continue;
			const reference = first(media, "MediaFile")?.textContent?.trim();
			if (!reference) continue;
			const file = resolvePath(
					path,
					reference.startsWith("/")
						? reference
						: base
							? `${base}/${reference}`
							: reference,
				),
				bytes = archive.files[file];
			if (!bytes || decoded.has(file) || rasterMime(bytes)) continue;
			decoded.add(file);
			abort(options.signal);
			if (bytes[0] === 66 && bytes[1] === 77) archive.files[file] = decodeBmp(bytes);
			else if ((bytes[0] === 73 && bytes[1] === 73) || (bytes[0] === 77 && bytes[1] === 77))
				archive.files[file] = decodeTiff(bytes);
			else if (options.decodeImage) {
				const decoded = await options.decodeImage(
					bytes.slice(),
					attr(media, "Format"),
					file,
				);
				if (!rasterMime(decoded))
					throw new Error("decodeImage must return PNG or JPEG bytes.");
				archive.files[file] = decoded.slice();
			}
			abort(options.signal);
		}
	}
	return resources;
}
