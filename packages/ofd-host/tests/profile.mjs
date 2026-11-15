import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	selectFormatContributions,
	readContributionExtensions,
	desktopFormatContributionModule,
} from "../../../als-office/apps/desktop/scripts/format-contribution-catalog.mjs";
import { DOCX_ARTIFACT_CONVERTERS } from "@yaochn/als-office-docx";
import { PPTX_ARTIFACT_CONVERTERS } from "@yaochn/als-office-pptx";
import { VSDX_ARTIFACT_CONVERTERS } from "@yaochn/als-office-vsdx";
import { XLSX_ARTIFACT_CONVERTERS } from "@yaochn/als-office-xlsx";
import { TEXT_EXTENSIONS } from "../../text/dist/formats.js";

const catalog = new URL("../../../profiles/cubeoffice/desktop/catalog.mjs", import.meta.url).href;
function profile(media) {
	return JSON.parse(
		execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				`const {profiles}=await import(${JSON.stringify(catalog)}); console.log(JSON.stringify(profiles.cubeoffice));`,
			],
			{
				encoding: "utf8",
				env: { ...process.env, CUBEOFFICE_BUNDLE_MEDIA: media ? "1" : "0" },
			},
		),
	);
}
test("default profile ships Office, graphics, book and notebook surfaces without optional codecs", async () => {
	const p = profile(false);
	for (const ext of ["ofd", "docx", "pptx", "xlsx", "pdf", "java", "txt"])
		assert.ok(p.supportedExtensions.includes(ext), ext);
	assert.ok(p.tauriConfig.bundle.externalBin.includes("binaries/cubeoffice-ofd-service"));
	assert.ok(!p.tauriConfig.bundle.externalBin.some((name) => /ffmpeg|ffprobe/.test(name)));
	assert.deepEqual(p.tauriConfig.app.security.assetProtocol.scope, []);
	for (const ext of ["ofd", "docx", "pptx", "xlsx"])
		assert.ok(
			p.tauriConfig.bundle.fileAssociations.some((a) => a.ext.includes(ext)),
			ext,
		);
	const selected = selectFormatContributions(p, await readContributionExtensions());
	assert.deepEqual(
		selected.map((e) => e.format),
		[
			"DOCX",
			"PPTX",
			"XLSX",
			"JMP",
			"VSDX",
			"HTML",
			"MARKDOWN",
			"PDF",
			"IMAGE",
			"AI",
			"PSD",
			"NOTES",
			"OFD",
			"EPUB",
		],
	);
	assert.match(desktopFormatContributionModule(selected), /CUBEOFFICE_OFD_CONTRIBUTION/);
});
test("every advertised desktop extension has an editor or import route", async () => {
	const p = profile(false);
	const manifests = await readContributionExtensions();
	const selected = selectFormatContributions(p, manifests);
	const directRoutes = new Set([
		...selected.flatMap((entry) => entry.extensions ?? manifests[entry.format]),
		...TEXT_EXTENSIONS,
	]);
	const imports = [
		...DOCX_ARTIFACT_CONVERTERS,
		...PPTX_ARTIFACT_CONVERTERS,
		...VSDX_ARTIFACT_CONVERTERS,
		...XLSX_ARTIFACT_CONVERTERS,
	].flatMap(({ manifest }) =>
		directRoutes.has(manifest.target.format) ? (manifest.source.extensions ?? []) : [],
	);
	const tsvModule = new URL("../../../apps/harmony/web/src/tsv-import.ts", import.meta.url).href;
	const tsvManifest = JSON.parse(
		execFileSync(
			process.execPath,
			[
				"--disable-warning=ExperimentalWarning",
				"--experimental-strip-types",
				"--input-type=module",
				"-e",
				`const {TSV_TO_XLSX_CONVERTER} = await import(${JSON.stringify(tsvModule)}); console.log(JSON.stringify(TSV_TO_XLSX_CONVERTER.manifest));`,
			],
			{ encoding: "utf8" },
		),
	);
	assert.ok(directRoutes.has(tsvManifest.target.format));
	const routed = new Set([...directRoutes, ...imports, ...tsvManifest.source.extensions]);
	for (const extension of p.openDocumentExtensions) {
		assert.ok(routed.has(extension), `Missing desktop surface for ${extension}`);
	}
});

test("media opt-in includes engines and corresponding sources", () => {
	const p = profile(true);
	assert.ok(p.tauriConfig.bundle.externalBin.includes("binaries/cubeoffice-ffmpeg"));
	assert.ok(Object.values(p.tauriConfig.bundle.resources).includes("ofd-media-source/"));
});
test("duplicate profile contribution is rejected", () => {
	const p = profile(false);
	p.formatContributions.push(p.formatContributions[0]);
	assert.throws(() => selectFormatContributions(p, {}), /Duplicate/);
});
