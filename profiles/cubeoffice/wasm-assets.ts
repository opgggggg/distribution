import { configureOfficeWasmAssets } from "@yaochn/als-office-editor-core/standalone-wasm";
import compact from "../../als-office/packages/docx/src/compact-kernel/compact-kernel.wasm?url";
import index from "../../als-office/packages/docx/src/batch-index/docx-text-index.wasm?url";
import word from "../../als-office/packages/docx/src/word-kernel/word-kernel.wasm?url";
import archive from "../../als-office/packages/ooxml-core/src/package-kernel/package-kernel.wasm?url";
import xlsx from "../../als-office/packages/xlsx/src/kernel/xlsx-kernel.wasm?url";
import pptx from "../../als-office/packages/pptx/src/kernel/pptx-kernel.wasm?url";
import vsdx from "../../als-office/packages/vsdx/src/kernel/vsdx-kernel.wasm?url";
import pdf from "../../als-office/packages/pdf/src/kernel/pdf-kernel.wasm?url";
import markdown from "../../als-office/packages/markdown/src/kernel/markdown-kernel.wasm?url";
import html from "../../als-office/packages/html/src/kernel/html-kernel.wasm?url";
import image from "../../als-office/packages/image/src/kernel/image-kernel.wasm?url";
import legacy from "../../als-office/packages/editor-core/src/legacy-office/kernel/legacy-kernel.wasm?url";

/** Explicit asset imports survive dependency prebundling and all native payload builds. */
export const OFFICE_WASM_URLS = {
	"compact-kernel.wasm": compact,
	"docx-text-index.wasm": index,
	"word-kernel.wasm": word,
	"package-kernel.wasm": archive,
	"xlsx-kernel.wasm": xlsx,
	"pptx-kernel.wasm": pptx,
	"vsdx-kernel.wasm": vsdx,
	"pdf-kernel.wasm": pdf,
	"markdown-kernel.wasm": markdown,
	"html-kernel.wasm": html,
	"image-kernel.wasm": image,
	"legacy-kernel.wasm": legacy,
};

// Keep Android's established file origin and IndexedDB drafts. Only immutable WASM
// fetches use the native asset endpoint: upstream's file: loader is for Node fs.
for (const name of Object.keys(OFFICE_WASM_URLS) as (keyof typeof OFFICE_WASM_URLS)[]) {
	const url = new URL(OFFICE_WASM_URLS[name], document.baseURI);
	OFFICE_WASM_URLS[name] =
		url.protocol === "file:" && url.pathname.startsWith("/android_asset/web/assets/")
			? `https://appassets.androidplatform.net/assets/web/assets/${url.pathname.split("/").pop()}`
			: url.href;
}
configureOfficeWasmAssets({ urls: OFFICE_WASM_URLS });
