import type { EditorFontResolver } from "@yaochn/als-office-editor-core";
const licenseUrl = new URL(
	"../../../../../als-office/packages/fonts/fonts/licenses/notosanssc.txt",
	import.meta.url,
).href;
import cjkFontUrl from "../../../../../als-office/packages/fonts/fonts/notosanssc/notosanssc-400-normal.ttf?url";
// A pinned OFL font is packaged locally. PDF form/FreeText export works offline
// and never silently replaces Chinese characters with question marks.
let bytes: Promise<Uint8Array> | undefined;
export const mobilePdfFonts: EditorFontResolver = {
	async resolve(request) {
		request.signal?.throwIfAborted();
		if (
			typeof document !== "undefined" &&
			!document.querySelector("link[data-mobile-font-license]")
		) {
			const license = document.createElement("link");
			license.rel = "license";
			license.href = licenseUrl;
			license.dataset.mobileFontLicense = "true";
			document.head.appendChild(license);
		}
		const content = await (bytes ??= fetch(cjkFontUrl)
			.then(async (response) => {
				if (!response.ok) throw new Error("文档字体读取失败，请重试。");
				return new Uint8Array(await response.arrayBuffer());
			})
			.catch((cause) => {
				bytes = undefined;
				throw cause;
			}));
		request.signal?.throwIfAborted();
		return {
			requestedFamily: request.family,
			resolvedFamily: "Noto Sans SC",
			source: content,
			format: "ttf",
			embeddingAllowed: true,
			reason: "GLYPH_FALLBACK",
			coverage: "known",
		};
	},
};
