import { XMLSerializer } from "@xmldom/xmldom";
import { parseXml, descendants, attr } from "./archive.js";
import type { Matrix } from "./geometry.js";
const MM = 96 / 25.4;
/** Smallest singular value: conservative stroke scale under arbitrary affine transforms. */
export function strokeScale(matrix: Matrix): number {
	const [a, b, c, d] = matrix,
		sum = a * a + b * b + c * c + d * d,
		det = a * d - b * c;
	const largest = Math.sqrt((sum + Math.sqrt(Math.max(0, sum * sum - 4 * det * det))) / 2);
	return largest ? Math.abs(det) / largest : 0;
}
export function deviceLineWidth(width: number, transformScale: number, deviceScale = 1): number {
	if (width < 0 || !Number.isFinite(width))
		throw new Error("OFD line width must be non-negative.");
	const unit = MM * Math.max(transformScale, 1e-12) * deviceScale;
	return width === 0 ? 1 / unit : Math.max(width, 2 / unit);
}
/** Apply §8.2.1 pixel minima at the final device scale, instead of baking zoom into the document. */
export function svgAtDeviceScale(svg: string, scale: number): string {
	if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Invalid OFD device scale.");
	if (!svg.includes("data-ofd-line-width")) return svg;
	const root = parseXml(svg);
	for (const node of descendants(root, "*"))
		if (node.hasAttribute("data-ofd-line-width")) {
			const width = deviceLineWidth(
				Number(attr(node, "data-ofd-line-width")),
				Number(attr(node, "data-ofd-stroke-scale")),
				scale,
			);
			node.setAttribute("stroke-width", String(width));
			node.setAttribute(
				"stroke-miterlimit",
				String(Math.max(1, Number(attr(node, "data-ofd-miter-length")) / width)),
			);
		}
	return new XMLSerializer().serializeToString(root);
}
