import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const iosWeb = new URL("../App/Resources/web/", import.meta.url);

// The iOS payload is the same code-split Vite output the Android WebView loads (see
// apps/harmony/vite.config.ts). WKWebView serves it through WebAssetSchemeHandler,
// which gives the page a real origin so ES module chunks — and the IndexedDB
// autosave — work; `file://` provides neither.
const build = spawnSync("npm", ["run", "build:web:ios", "-w", "@cubexp/office-harmony"], {
	cwd: repositoryRoot,
	stdio: "inherit",
	env: { ...process.env, APP_PROFILE: process.env.APP_PROFILE || "cubeoffice" },
	shell: process.platform === "win32",
});
if (build.status !== 0) {
	throw new Error(`iOS mobile Web build failed with exit code ${build.status ?? "unknown"}.`);
}

const indexUrl = new URL("index.html", iosWeb);
const index = await readFile(indexUrl, "utf8");
const indexSize = (await stat(indexUrl)).size;
if (indexSize > 1024 * 1024 || !/<script\b[^>]*\bsrc=/u.test(index)) {
	throw new Error(
		`${fileURLToPath(indexUrl)} must reference external chunks; an inlined payload makes the iOS cold start parse the whole editor before the first paint.`,
	);
}
const chunks = (await readdir(new URL("assets/", iosWeb))).filter((name) => name.endsWith(".js"));
if (chunks.length < 2) {
	throw new Error("Expected code-split JavaScript chunks in App/Resources/web/assets");
}

console.log(`Synced mobile Web assets into App/Resources/web (${chunks.length} JavaScript chunks)`);
