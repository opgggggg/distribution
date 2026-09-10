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
	cliBinaryName: "cubeoffice",
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
	// CubeOffice's own starter presentations, published alongside the website so
	// the gallery can grow without shipping an app update. `cubexp.com` is
	// already in this profile's connect-src, which is what the fetch needs.
	documentTemplates: {
		endpoint: "https://cubexp.com/templates/index.json",
		formats: ["pptx"],
	},
	templateCopy: {
		en: {
			title: "New presentation",
			subtitle: "Start from a CubeOffice template, or from a blank slide.",
			blank: "Blank presentation",
			blankHelp: "One empty slide",
			slides: "{count} slides",
			loading: "Loading templates…",
			loadFailed: "Templates could not be loaded. You can still start from blank.",
			retry: "Try again",
			empty: "No templates are available yet.",
			close: "Close",
		},
		"zh-CN": {
			title: "新建演示文稿",
			subtitle: "从 CubeOffice 模板开始，或从空白页开始。",
			blank: "空白演示文稿",
			blankHelp: "一页空白幻灯片",
			slides: "{count} 页",
			loading: "正在加载模板…",
			loadFailed: "模板加载失败，你仍然可以从空白页开始。",
			retry: "重试",
			empty: "暂时还没有可用的模板。",
			close: "关闭",
		},
	},
	clientServices: {
		backend: "rest",
		feedbackEndpoint: "https://cubexp.com/api/v1/feedback",
		logEndpoint: "https://cubexp.com/api/v1/logs",
		clientIdStorageKey: "cubeoffice.client-id",
		privacyPolicyUrl: "https://cubexp.com/privacy",
		feedbackCategories: ["bug", "suggestion", "question", "other"],
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
		version: "1.4.2",
		mainBinaryName: "cubeoffice-app",
		bundle: {
			...officeProfile.tauriConfig.bundle,
			shortDescription: "Open, edit, and read Office documents with AI",
			externalBin: ["binaries/cubeoffice"],
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
			security: {
				...officeProfile.tauriConfig.app.security,
				csp: "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost blob: https://cubexp.com; img-src 'self' asset: http://asset.localhost blob: data:; font-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:",
			},
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
