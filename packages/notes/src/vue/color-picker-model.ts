/** sRGB samples from the native iPadOS 26.5 picker; row-major, 12 columns. */
export const IPAD_GRID_COLORS: readonly string[] = [
	"#ffffff",
	"#ebebeb",
	"#d6d6d6",
	"#c2c2c2",
	"#adadad",
	"#999999",
	"#858585",
	"#707070",
	"#5c5c5c",
	"#474747",
	"#333333",
	"#000000",
	"#00374a",
	"#011d57",
	"#11053b",
	"#2e063d",
	"#3c071b",
	"#5c0701",
	"#5a1c00",
	"#583300",
	"#563d00",
	"#666100",
	"#4f5504",
	"#263e0f",
	"#004d65",
	"#012f7b",
	"#1a0a52",
	"#450d59",
	"#551029",
	"#831100",
	"#7b2900",
	"#7a4a00",
	"#785800",
	"#8d8602",
	"#6f760a",
	"#38571a",
	"#016e8f",
	"#0042a9",
	"#2c0977",
	"#61187c",
	"#791a3d",
	"#b51a00",
	"#ad3e00",
	"#a96800",
	"#a67b01",
	"#c4bc00",
	"#9ba50e",
	"#4e7a27",
	"#008cb4",
	"#0056d6",
	"#371a94",
	"#7a219e",
	"#99244f",
	"#e22400",
	"#da5100",
	"#d38301",
	"#d19d01",
	"#f5ec00",
	"#c3d117",
	"#669d34",
	"#00a1d8",
	"#0061fe",
	"#4d22b2",
	"#982abc",
	"#b92d5d",
	"#ff4015",
	"#ff6a00",
	"#ffab01",
	"#fdc700",
	"#fefb41",
	"#d9ec37",
	"#76bb40",
	"#01c7fc",
	"#3a87fe",
	"#5e30eb",
	"#be38f3",
	"#e63b7a",
	"#ff6250",
	"#ff8648",
	"#feb43f",
	"#fecb3e",
	"#fff76b",
	"#e4ef65",
	"#96d35f",
	"#52d6fc",
	"#74a7ff",
	"#864ffe",
	"#d357fe",
	"#ee719e",
	"#ff8c82",
	"#ffa57d",
	"#ffc777",
	"#ffd977",
	"#fff994",
	"#eaf28f",
	"#b1dd8b",
	"#93e3fd",
	"#a7c6ff",
	"#b18cfe",
	"#e292fe",
	"#f4a4c0",
	"#ffb5af",
	"#ffc5ab",
	"#ffd9a8",
	"#fee4a8",
	"#fffbb9",
	"#f2f7b7",
	"#cde8b5",
	"#cbf0ff",
	"#d3e2ff",
	"#d9c9fe",
	"#efcaff",
	"#f9d3e0",
	"#ffdbd8",
	"#ffe2d6",
	"#ffecd4",
	"#fff2d5",
	"#fefcdd",
	"#f7fadb",
	"#dfeed4",
];
export const SPECTRUM_COLORS: readonly string[] = [
	"#ff0000",
	"#ff0800",
	"#ff1e00",
	"#ff4100",
	"#ff7000",
	"#ffa500",
	"#ffd500",
	"#fff600",
	"#ffff00",
	"#f1ff00",
	"#ccff00",
	"#9aff00",
	"#66ff00",
	"#39ff00",
	"#18ff00",
	"#06ff00",
	"#00ff00",
	"#00ff07",
	"#00ff1b",
	"#00ff3d",
	"#00ff6b",
	"#00ff9f",
	"#00ffd1",
	"#00fff3",
	"#00ffff",
	"#00f3ff",
	"#00d1ff",
	"#009fff",
	"#006bff",
	"#003dff",
	"#001bff",
	"#0007ff",
	"#0000ff",
	"#0600ff",
	"#1800ff",
	"#3900ff",
	"#6600ff",
	"#9a00ff",
	"#cc00ff",
	"#f100ff",
	"#ff00ff",
	"#ff00f6",
	"#ff00d5",
	"#ff00a5",
	"#ff0070",
	"#ff0041",
	"#ff001e",
	"#ff0008",
	"#ff0001",
];
const FADES: readonly number[] = [
	1.0, 0.9804, 0.949, 0.9098, 0.8588, 0.8039, 0.7412, 0.6706, 0.6, 0.5216, 0.4392, 0.3529, 0.2667,
	0.1843, 0.1059, 0.0392, 0.0, 0.0196, 0.051, 0.0902, 0.1412, 0.1961, 0.2588, 0.3294, 0.4, 0.4784,
	0.5608, 0.6471, 0.7333, 0.8157, 0.8941, 0.9608, 1.0,
];
export const spectrumBackground = `linear-gradient(to right, ${FADES.map((a, i) => `rgba(${i <= 16 ? "255,255,255" : "0,0,0"},${a}) ${(i / 32) * 100}%`).join(",")}),linear-gradient(to bottom,${SPECTRUM_COLORS.map((c, i) => `${c} ${(i / 48) * 100}%`).join(",")})`;
export function normalizeHex(value: string): string | undefined {
	const raw = value.trim().replace(/^#/, "");
	return /^[\da-f]{6}$/i.test(raw)
		? "#" + raw.toLowerCase()
		: /^[\da-f]{3}$/i.test(raw)
			? "#" +
				raw
					.split("")
					.map((c) => c + c)
					.join("")
					.toLowerCase()
			: undefined;
}
export function rgb(hex: string): number[] {
	return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
export function rgbHex(values: number[]): string {
	return (
		"#" +
		values
			.map((n) =>
				Math.round(Math.max(0, Math.min(255, n)))
					.toString(16)
					.padStart(2, "0"),
			)
			.join("")
	);
}
export function spectrumColor(x: number, y: number): string {
	x = Math.max(0, Math.min(1, x));
	y = Math.max(0, Math.min(1, y));
	const hi = y * 48,
		hr = Math.min(47, Math.floor(hi)),
		hf = hi - hr,
		a = rgb(SPECTRUM_COLORS[hr]),
		b = rgb(SPECTRUM_COLORS[hr + 1]);
	const fi = x * 32,
		fr = Math.min(31, Math.floor(fi)),
		fade = FADES[fr] + (FADES[fr + 1] - FADES[fr]) * (fi - fr);
	return rgbHex(
		a.map((v, i) => {
			const channel = v + (b[i] - v) * hf;
			return x <= 0.5 ? channel + (255 - channel) * fade : channel * (1 - fade);
		}),
	);
}
let fieldSamples: { x: number; y: number; values: number[] }[] | undefined;
export function spectrumPosition(color: string): { x: number; y: number } {
	if (!fieldSamples) {
		fieldSamples = [];
		for (let y = 0; y <= 96; y++)
			for (let x = 0; x <= 64; x++)
				fieldSamples.push({
					x: x / 64,
					y: y / 96,
					values: rgb(spectrumColor(x / 64, y / 96)),
				});
	}
	const target = rgb(color);
	let best = Infinity,
		position = { x: 0.5, y: 0 };
	for (const sample of fieldSamples) {
		const error = sample.values.reduce((sum, v, i) => sum + (v - target[i]) ** 2, 0);
		if (error < best) {
			best = error;
			position = { x: sample.x, y: sample.y };
		}
	}
	return position;
}
export interface ColorSample {
	color: string;
	opacity: number;
}
const STORAGE_KEY = "cubeoffice.notes.colorSamples.v1";
const defaults: ColorSample[] = ["#000000", "#0161fd", "#32c759", "#ffcc02", "#ff3a30"].map(
	(color) => ({ color, opacity: 1 }),
);
export function loadColorSamples(): ColorSample[] {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
		if (Array.isArray(saved) && saved.length <= 32)
			return saved.filter(
				(c): c is ColorSample =>
					c &&
					/^#[\da-f]{6}$/i.test(c.color) &&
					Number.isFinite(c.opacity) &&
					c.opacity >= 0 &&
					c.opacity <= 1,
			);
	} catch {}
	return defaults.map((c) => ({ ...c }));
}
export function saveColorSamples(samples: ColorSample[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(samples.slice(-32)));
	} catch {}
}

const MODE_KEY = "cubeoffice.notes.colorMode.v1";
export function loadColorMode(): string {
	try {
		const mode = localStorage.getItem(MODE_KEY);
		if (mode && ["grid", "spectrum", "sliders"].includes(mode)) return mode;
	} catch {}
	return "grid";
}
export function saveColorMode(mode: string): void {
	try {
		localStorage.setItem(MODE_KEY, mode);
	} catch {}
}
