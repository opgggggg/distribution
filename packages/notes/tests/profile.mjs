import { test } from "node:test";
import assert from "node:assert/strict";
import { profiles } from "../../../profiles/cubeoffice/desktop/catalog.mjs";
import { OPEN_FORMATS } from "../../../scripts/open-formats.mjs";

test("desktop profiles register writable notebooks and retain existing associations", () => {
	for (const profile of Object.values(profiles)) {
		assert.ok(profile.newDocumentExtensions.includes("cubenote"));
		for (const ext of ["cubenote", "xopp", "xoj"]) {
			assert.ok(profile.openDocumentExtensions.includes(ext));
			assert.ok(
				profile.tauriConfig.bundle.fileAssociations.some(
					(entry) => entry.ext.includes(ext) && entry.role === "Editor",
				),
			);
		}
		assert.equal(
			profile.formatContributions.find((c) => c.format === "NOTES").binding,
			"NOTES_VUE_FORMAT_CONTRIBUTION",
		);
		for (const ext of ["epub", "ofd", "java"])
			assert.ok(
				profile.tauriConfig.bundle.fileAssociations.some((entry) =>
					entry.ext.includes(ext),
				),
			);
	}
});
test("mobile open lists route native and Xournal files to the notebook engine", () => {
	for (const ext of ["cubenote", "xopp", "xoj"])
		assert.equal(OPEN_FORMATS.find((f) => f.extensions.includes(ext))?.engine, "notes");
});
