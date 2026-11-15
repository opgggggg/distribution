import type { PsdTextStyle } from "./document";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

/** ALS-private additional-layer-info key carrying browser-editable text formatting. */
export const PSD_TEXT_STYLE_BLOCK_KEY = "AlTS";

export function encodePsdTextStyle(style: PsdTextStyle): Uint8Array {
	return textEncoder.encode(
		JSON.stringify({
			version: 1,
			fontFamily: style.fontFamily,
			fontSize: style.fontSize,
			bold: style.bold,
			italic: style.italic,
			underline: style.underline,
			strikethrough: style.strikethrough,
			color: style.color,
		}),
	);
}

export function decodePsdTextStyle(data: Uint8Array): PsdTextStyle | null {
	try {
		const value = JSON.parse(textDecoder.decode(data)) as unknown;
		if (!isRecord(value) || value.version !== 1) return null;
		if (typeof value.fontFamily !== "string" || !value.fontFamily.trim()) return null;
		if (!finiteBetween(value.fontSize, 4, 500)) return null;
		if (
			typeof value.bold !== "boolean" ||
			typeof value.italic !== "boolean" ||
			typeof value.underline !== "boolean" ||
			typeof value.strikethrough !== "boolean"
		) {
			return null;
		}
		if (!isRecord(value.color)) return null;
		if (
			!finiteBetween(value.color.r, 0, 255) ||
			!finiteBetween(value.color.g, 0, 255) ||
			!finiteBetween(value.color.b, 0, 255)
		) {
			return null;
		}
		return {
			fontFamily: value.fontFamily.trim(),
			fontSize: value.fontSize,
			bold: value.bold,
			italic: value.italic,
			underline: value.underline,
			strikethrough: value.strikethrough,
			color: {
				r: value.color.r,
				g: value.color.g,
				b: value.color.b,
			},
		};
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteBetween(value: unknown, min: number, max: number): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
