import { lstat, readlink, symlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sharedModules = resolve(repositoryRoot, "node_modules");
const upstreamModules = resolve(repositoryRoot, "als-office/node_modules");

try {
	const entry = await lstat(upstreamModules);
	if (!entry.isSymbolicLink()) process.exit(0);
	const target = resolve(dirname(upstreamModules), await readlink(upstreamModules));
	if (target === sharedModules) process.exit(0);
	throw new Error(`als-office/node_modules points to ${target}, expected ${sharedModules}`);
} catch (error) {
	if (error?.code !== "ENOENT") throw error;
}

await symlink(
	relative(dirname(upstreamModules), sharedModules),
	upstreamModules,
	process.platform === "win32" ? "junction" : "dir",
);
