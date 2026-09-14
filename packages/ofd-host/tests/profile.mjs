import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	selectFormatContributions,
	desktopFormatContributionModule,
} from "../../../als-office/apps/desktop/scripts/format-contribution-catalog.mjs";
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
test("default profile preserves text and Office formats and omits optional codecs", () => {
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
	const selected = selectFormatContributions(p, { DOCX: ["docx"], PDF: ["pdf"] });
	assert.deepEqual(
		selected.map((e) => e.format),
		["DOCX", "PDF", "OFD"],
	);
	assert.match(desktopFormatContributionModule(selected), /CUBEOFFICE_OFD_CONTRIBUTION/);
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
