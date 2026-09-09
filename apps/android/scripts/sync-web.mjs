import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const androidWeb = new URL("../app/src/main/assets/web/", import.meta.url);

// The Android payload is the code-split Vite output (see apps/harmony/vite.config.ts),
// written straight into the Android assets directory. Unlike the HarmonyOS payload it
// is not inlined into one file: the WebView loads the entry chunk and fetches the
// on-demand icon and SmartArt libraries only when a picker opens them.
const build = spawnSync("npm", ["run", "build:web:android", "-w", "@yaochn/als-office-harmony"], {
	cwd: repositoryRoot,
	stdio: "inherit",
	env: { ...process.env, APP_PROFILE: process.env.APP_PROFILE || "cubeoffice" },
	shell: process.platform === "win32",
});
if (build.status !== 0) {
	throw new Error(`Android mobile Web build failed with exit code ${build.status ?? "unknown"}.`);
}

const indexUrl = new URL("index.html", androidWeb);
const index = await readFile(indexUrl, "utf8");
const indexSize = (await stat(indexUrl)).size;
if (indexSize > 1024 * 1024 || !/<script\b[^>]*\bsrc=/u.test(index)) {
	throw new Error(
		`${fileURLToPath(indexUrl)} must reference external chunks; an inlined payload makes the Android cold start parse the whole editor before the first paint.`,
	);
}
const chunks = (await readdir(new URL("assets/", androidWeb))).filter((name) => name.endsWith(".js"));
if (chunks.length < 2) {
	throw new Error("Expected code-split JavaScript chunks in app/src/main/assets/web/assets");
}

console.log(
	`Synced mobile Web assets into app/src/main/assets/web (${chunks.length} JavaScript chunks)`,
);
