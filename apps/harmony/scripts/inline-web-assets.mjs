import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outputUrl = new URL("../entry/src/main/resources/rawfile/web/", import.meta.url);
const indexUrl = new URL("index.html", outputUrl);
let html = await readFile(indexUrl, "utf8");

const scriptTag = html.match(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/u);
const styleTag =
	html.match(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/u) ??
	html.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']stylesheet["'][^>]*>/u);

if (!scriptTag || !styleTag) {
	throw new Error("Expected one generated JavaScript entry and one stylesheet in index.html");
}

const script = await readFile(new URL(scriptTag[1], indexUrl), "utf8");
const style = await readFile(new URL(styleTag[1], indexUrl), "utf8");

html = html
	.replace(
		scriptTag[0],
		() => `<script type="module">${script.replaceAll("</script", "<\\/script")}</script>`,
	)
	.replace(styleTag[0], () => `<style>${style.replaceAll("</style", "<\\/style")}</style>`);

await writeFile(indexUrl, html);
await rm(new URL("assets/", outputUrl), { recursive: true, force: true });

console.log(`Inlined ArkWeb payload into ${fileURLToPath(indexUrl)}`);
