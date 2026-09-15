import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	profiles,
	resolveDesktopAppProfileId,
} from "../../profiles/cubeoffice/desktop/catalog.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const catalog = path.join(root, "profiles/cubeoffice/desktop/catalog.mjs");
const target = "x86_64-pc-windows-msvc";

// Read the packaging config the way a build does, without the renderer build a
// full `run-cubeoffice-desktop.mjs --print-config` would run first.
function mergedConfig(profileId) {
	return JSON.parse(
		execFileSync(
			process.execPath,
			[
				path.join(root, "als-office/apps/desktop/scripts/build-desktop.mjs"),
				"--profile",
				profileId,
				"--print-config",
				"--target",
				target,
			],
			{ encoding: "utf8", env: { ...process.env, DESKTOP_APP_PROFILES_PACKAGE: catalog } },
		),
	);
}

test("the Huawei channel name selects the market profile", () => {
	assert.equal(resolveDesktopAppProfileId("huawei"), "cubeoffice-huawei");
	assert.equal(resolveDesktopAppProfileId("direct"), "cubeoffice");
	assert.equal(resolveDesktopAppProfileId(""), "cubeoffice");
	assert.throws(() => resolveDesktopAppProfileId("appgallery"), /Unknown CubeOffice desktop/);
	assert.equal(profiles["cubeoffice-huawei"].autoUpdate, false);
	assert.equal(profiles.cubeoffice.autoUpdate, true);
});

test("the market package keeps the identity AppGallery registers", () => {
	const direct = mergedConfig("cubeoffice");
	const huawei = mergedConfig("cubeoffice-huawei");
	// AppGallery pins the listing to the registry DisplayName, which NSIS writes
	// from productName, and refuses a package whose version differs from the one
	// configured in the app. Both have to survive the channel switch unchanged.
	assert.equal(huawei.productName, direct.productName);
	assert.equal(huawei.identifier, direct.identifier);
	assert.equal(huawei.version, direct.version);
	assert.equal(huawei.mainBinaryName, direct.mainBinaryName);
	assert.deepEqual(huawei.bundle.targets, ["nsis"]);
});

test("only the market package uses the Huawei installer template", () => {
	const huawei = mergedConfig("cubeoffice-huawei");
	const nsis = huawei.bundle.windows.nsis;
	assert.equal(nsis.template, path.join(root, "profiles/cubeoffice/desktop/nsis/installer.nsi"));
	assert.ok(existsSync(nsis.template));
	assert.deepEqual(nsis.languages, ["SimpChinese"]);
	// The per-user install mode still comes from the platform config.
	assert.equal(nsis.installMode, "currentUser");
	assert.equal(mergedConfig("cubeoffice").bundle.windows.nsis.template, undefined);
});

test("the installer template keeps the changes Huawei's spec needs", () => {
	// A re-sync against a newer Tauri template has to carry these over, so name
	// what each one is rather than counting the `CubeOffice:` markers.
	const template = readFileSync(
		path.join(root, "profiles/cubeoffice/desktop/nsis/installer.nsi"),
		"utf8",
	);
	assert.match(template, /Function SelectDefaultInstallDrive/);
	assert.match(template, /GetDriveTypeW/);
	assert.match(template, /MUI_PAGE_CUSTOMFUNCTION_SHOW DirectoryPageShow/);
	// The page has no free band of its own; the reflow is what makes room.
	assert.match(template, /Function CubeShiftControlUp/);
	assert.match(template, /Function CubeShrinkControl/);
	assert.match(template, /CUBE_LABEL_SHORTCUT/);
	assert.match(template, /CUBE_LABEL_AUTOSTART/);
	assert.match(template, /"\/AUTOSTART"/);
	assert.match(template, /DeleteRegValue SHCTX "\$\{RUNKEY\}"/);
	// The welcome page would otherwise stand between the user and the disk choice.
	assert.match(template, /MUI_PAGE_CUSTOMFUNCTION_PRE Skip\n!insertmacro MUI_PAGE_WELCOME/);
	// Tauri renders the template with handlebars, so its placeholders must survive.
	assert.match(template, /\{\{product_name\}\}/);
});

test("the market package carries no updater of its own", () => {
	const huawei = mergedConfig("cubeoffice-huawei");
	assert.equal(huawei.bundle.createUpdaterArtifacts, false);
	assert.equal(huawei.plugins?.updater, undefined);
	// The direct download keeps updating itself; only the store build defers.
	const direct = mergedConfig("cubeoffice");
	assert.equal(direct.bundle.createUpdaterArtifacts, true);
	assert.ok(direct.plugins.updater.endpoints.length > 0);
});
