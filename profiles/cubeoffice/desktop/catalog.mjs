import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const profilePackageEnv = "DESKTOP_APP_PROFILES_PACKAGE";
const configuredProfilePackage = process.env[profilePackageEnv];
let officeProfile;

// Load the upstream Office defaults through a separate module instance while
// the external catalog hook is disabled. CubeOffice then overrides only its
// distribution-owned identity, copy, artwork, updater, and theme entry point.
try {
	delete process.env[profilePackageEnv];
	const upstreamProfiles = await import(
		new URL(
			"../../../als-office/apps/desktop/scripts/desktop-profiles.mjs?cubeoffice-base",
			import.meta.url,
		)
	);
	officeProfile = await upstreamProfiles.resolveProfile("office");
} finally {
	if (configuredProfilePackage === undefined) delete process.env[profilePackageEnv];
	else process.env[profilePackageEnv] = configuredProfilePackage;
}

const fromHere = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));
const icon = (fileName) => path.join(fromHere("./icons/"), fileName);

const cubeOfficeProfile = {
	...officeProfile,
	id: "cubeoffice",
	name: "CubeOffice",
	identifier: "com.cubexp.office",
	logoAsset: "https://cubexp.com/assets/cubeoffice-mark.svg",
	appTitle: "CubeOffice",
	aboutTitle: "CubeOffice",
	shortDescription: "Open, edit, and read Office documents with AI",
	description:
		"A cross-platform document workspace for opening, editing, and reading Office files with your preferred AI app working alongside you.",
	welcomePanelModule: fromHere("./CubeOfficeWelcomePanel.vue"),
	settingsCopy: {
		en: {
			...officeProfile.settingsCopy.en,
			subtitle: "Choose how CubeOffice behaves on this computer.",
		},
		"zh-CN": {
			...officeProfile.settingsCopy["zh-CN"],
			subtitle: "选择 CubeOffice 在这台电脑上的工作方式。",
		},
	},
	updaterEndpoint: "https://cubexp.com/updates/latest.json",
	publish: {
		...officeProfile.publish,
		packageName: "cubeoffice",
		notesPrefix: "CubeOffice",
	},
	signing: {
		...officeProfile.signing,
		environment: {
			...officeProfile.signing?.environment,
			DESKTOP_APP_IDENTIFIER: "com.cubexp.office",
		},
	},
	tauriConfig: {
		...officeProfile.tauriConfig,
		bundle: {
			...officeProfile.tauriConfig.bundle,
			shortDescription: "Open, edit, and read Office documents with AI",
			icon: [
				icon("32x32.png"),
				icon("128x128.png"),
				icon("128x128@2x.png"),
				icon("icon.icns"),
				icon("icon.png"),
			],
		},
		app: {
			...officeProfile.tauriConfig.app,
			windows: [{ title: "CubeOffice" }],
		},
	},
	windowsConfig: {
		...officeProfile.windowsConfig,
		bundle: {
			...officeProfile.windowsConfig.bundle,
			icon: [
				icon("icon.ico"),
				icon("32x32.png"),
				icon("128x128.png"),
				icon("128x128@2x.png"),
			],
		},
	},
};

export const profiles = { cubeoffice: cubeOfficeProfile };
export const defaultProfile = "cubeoffice";

export function resolveDesktopAppProfileId(profileId) {
	const normalized = typeof profileId === "string" ? profileId.trim().toLowerCase() : "";
	if (!normalized || normalized === "cubeoffice") return "cubeoffice";
	throw new Error(`Unknown CubeOffice desktop profile "${normalized}".`);
}

export function getDesktopAppProfile(profileId) {
	return profiles[resolveDesktopAppProfileId(profileId)];
}

export default {
	profiles,
	defaultProfile,
	resolveDesktopAppProfileId,
	getDesktopAppProfile,
};
