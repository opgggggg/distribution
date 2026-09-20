import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

// These delimiters identify existing managed configuration, not visible branding.
// Changing them would strand connections created by older CubeOffice versions.
const legacyMarkers = new Set([
	'const CODEX_BLOCK_START: &str = "# AuroraPrime Office connection — managed automatically";',
	'const CODEX_BLOCK_END: &str = "# End AuroraPrime Office connection";',
]);
const sessionVariable = "CUBEOFFICE_NATIVE_BRANDING_SESSION";

export function brandDesktopSource(source, file = "") {
	return source
		.split("\n")
		.map((line) => {
			if (
				file.replaceAll("\\", "/").endsWith("/ai_connect.rs") &&
				legacyMarkers.has(line.trim())
			)
				return line;
			return line
				.replaceAll("AuroraPrime Office", "CubeOffice")
				.replace(/\bAuroraPrime\b/g, "CubeOffice");
		})
		.join("\n");
}

export function assertRendererBranding(bundle) {
	for (const [name, entry] of Object.entries(bundle)) {
		if (entry.type !== "chunk" && !/\.(?:html|svg|css)$/.test(name)) continue;
		// Persisted DOCX property keys are part of the document format, not UI copy.
		const text = (entry.type === "chunk" ? entry.code : String(entry.source))
			.replaceAll("AuroraPrime.StyleRoles.v1", "")
			.replaceAll("AuroraPrime.TemplateProfile.v1.", "");
		if (/AuroraPrime/.test(text))
			throw new Error(`Upstream branding remains in CubeOffice renderer: ${name}`);
	}
}

// Native code has no Vite transform hook. Apply a reversible distribution-owned
// overlay for the lifetime of Cargo, including its nested beforeBuildCommand.
// A journal prevents concurrent builds and retains originals after termination.
export function withNativeBranding(root, build, env = process.env) {
	const folder = path.join(root, "profiles/cubeoffice/desktop/generated");
	const journalPath = path.join(folder, "native-branding.json");
	const restore = (journal) => {
		for (const entry of journal.files) {
			const current = readFileSync(entry.file, "utf8");
			if (current !== entry.original && current !== entry.branded) {
				throw new Error(
					`Source edited during CubeOffice build; recovery journal retained: ${journalPath} (${entry.file})`,
				);
			}
		}
		for (const entry of journal.files) writeFileSync(entry.file, entry.original);
		unlinkSync(journalPath);
	};
	if (existsSync(journalPath)) {
		const journal = JSON.parse(readFileSync(journalPath, "utf8"));
		if (env[sessionVariable] === journal.session) {
			for (const entry of journal.files) {
				if (readFileSync(entry.file, "utf8") !== entry.branded)
					throw new Error(`Native branding changed during build: ${entry.file}`);
			}
			return build(env);
		}
		// A killed parent may still have a running Cargo child. Never infer that
		// it is safe to restore sources solely from the parent's PID being gone.
		throw new Error(
			`CubeOffice native branding is locked (PID ${journal.pid}); inspect the build and recovery journal: ${journalPath}`,
		);
	}
	const files = [];
	const visit = (directory) => {
		for (const item of readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, item.name);
			if (item.isDirectory()) visit(file);
			else if (item.isFile() && /\.(?:rs|c|h|cpp|m|mm)$/.test(file)) {
				const original = readFileSync(file, "utf8");
				const branded = brandDesktopSource(original, file);
				if (original !== branded) files.push({ file, original, branded });
			}
		}
	};
	for (const name of ["src", "native"])
		visit(path.join(root, "als-office/apps/desktop/src-tauri", name));
	mkdirSync(folder, { recursive: true });
	const journal = { pid: process.pid, session: randomUUID(), files };
	writeFileSync(journalPath, JSON.stringify(journal), { flag: "wx", mode: 0o600 });
	try {
		for (const entry of files) writeFileSync(entry.file, entry.branded);
		return build({ ...env, [sessionVariable]: journal.session });
	} finally {
		restore(journal);
	}
}
