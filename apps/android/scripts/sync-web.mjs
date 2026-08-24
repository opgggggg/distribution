import { cp, mkdir, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const androidRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const harmonyWeb = fileURLToPath(
	new URL("../../harmony/entry/src/main/resources/rawfile/web/", import.meta.url),
);
const androidWeb = fileURLToPath(new URL("../app/src/main/assets/web/", import.meta.url));

const build = spawnSync("npm", ["run", "build:web", "-w", "@yaochn/als-office-harmony"], {
	cwd: repositoryRoot,
	stdio: "inherit",
	shell: process.platform === "win32",
});
if (build.status !== 0) {
	throw new Error(`Harmony mobile Web build failed with exit code ${build.status ?? "unknown"}.`);
}

await stat(new URL("index.html", `file://${harmonyWeb}/`));
await rm(androidWeb, { recursive: true, force: true });
await mkdir(androidWeb, { recursive: true });
await cp(harmonyWeb, androidWeb, { recursive: true });

console.log(`Synced mobile Web assets into ${androidRoot}app/src/main/assets/web`);
