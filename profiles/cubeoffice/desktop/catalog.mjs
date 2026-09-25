import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { TEXT_EXTENSIONS } from "../../../packages/text/dist/formats.js";

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
const baseTauri = JSON.parse(
	readFileSync(fromHere("../../../als-office/apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
);
const icon = (fileName) => path.join(fromHere("./icons/"), fileName);

const bundleOfdMedia = process.env.CUBEOFFICE_BUNDLE_MEDIA === "1";
const cubeOfficeProfile = {
	...officeProfile,
	supportedExtensions: [
		...new Set([...officeProfile.supportedExtensions, ...TEXT_EXTENSIONS, "ofd"]),
	],
	openDocumentExtensions: [
		...new Set([...officeProfile.openDocumentExtensions, ...TEXT_EXTENSIONS, "ofd"]),
	],
	supportedFormatLabels: [
		...officeProfile.supportedFormatLabels,
		"TXT",
		"JAVA",
		"JS",
		"TS",
		"JSON",
		"XML",
		"PY",
	],
	id: "cubeoffice",
	readonlyConversionExtensions: [...(officeProfile.readonlyConversionExtensions ?? []), "ofd"],
	formatContributions: [
		{
			format: "OFD",
			specifier: fromHere("../../../packages/ofd-host/src/desktop-contribution.ts"),
			binding: "CUBEOFFICE_OFD_CONTRIBUTION",
			extensions: ["ofd"],
		},
	],
	settingsExtensionModule: fromHere("../../../packages/ofd-host/src/TrustSettings.vue"),
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
		privacyPolicyUrl: "https://ai.kumaoyun.cc/cubeoffice/privacy",
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
		build: {
			...officeProfile.tauriConfig.build,
			beforeBuildCommand: "node ../../../scripts/run-cubeoffice-desktop.mjs --renderer-only",
			beforeDevCommand: "node ../../../scripts/run-cubeoffice-desktop.mjs --renderer-dev",
		},
		version: "1.5.1",
		mainBinaryName: "cubeoffice-app",
		bundle: {
			...officeProfile.tauriConfig.bundle,
			// Text/source and OFD both extend the upstream associations, and they have
			// to share one key: a second `fileAssociations` property would silently
			// replace this one and unregister the text file types.
			fileAssociations: [
				...(officeProfile.tauriConfig.bundle?.fileAssociations ??
					baseTauri.bundle.fileAssociations ??
					[]),
				{
					ext: [...TEXT_EXTENSIONS],
					name: "Text and source code",
					role: "Editor",
					rank: "Alternate",
				},
				{ ext: ["ofd"], mimeType: "application/ofd", role: "Viewer", rank: "Alternate" },
			],
			shortDescription: "Open, edit, and read Office documents with AI",
			externalBin: [
				"binaries/cubeoffice",
				"binaries/cubeoffice-ofd-service",
				...(bundleOfdMedia
					? ["binaries/cubeoffice-ffmpeg", "binaries/cubeoffice-ffprobe"]
					: []),
			],
			resources: {
				...(officeProfile.tauriConfig.bundle.resources ?? {}),
				...(bundleOfdMedia
					? {
							[fromHere("./generated/ofd-engines.json")]: "ofd-engines.json",
							[fromHere("./generated/media-source/")]: "ofd-media-source/",
						}
					: {}),
			},
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
				capabilities: [
					"desktop",
					{
						identifier: "cubeoffice-large-text-ranges",
						windows: ["main"],
						description:
							"Read bounded ranges from user-selected text files; existing file scope still applies.",
						permissions: [
							"fs:allow-open",
							"fs:allow-fstat",
							"fs:allow-read",
							"fs:allow-seek",
						],
					},
				],
				assetProtocol: { enable: true, scope: [] },
				csp: "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost blob: https://cubexp.com; img-src 'self' asset: http://asset.localhost blob: data:; font-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; media-src 'self' asset: http://asset.localhost blob: data:; worker-src 'self' blob:",
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

// The Huawei AppGallery (Windows) channel. The store distributes and upgrades
// the app, so this build carries no updater of its own: two upgrade paths would
// fight over the same installation, and the HarmonyOS build already upgrades
// through the store alone. Everything else stays identical to the direct build
// on purpose — AppGallery binds the listing to the registry DisplayName that
// Tauri writes from `productName`, and rejects a package whose version differs
// from the one configured in the app.
const huaweiWindowsProfile = {
	...cubeOfficeProfile,
	id: "cubeoffice-huawei",
	autoUpdate: false,
	windowsConfig: {
		...cubeOfficeProfile.windowsConfig,
		bundle: {
			...cubeOfficeProfile.windowsConfig.bundle,
			windows: {
				...(cubeOfficeProfile.windowsConfig.bundle?.windows ?? {}),
				nsis: {
					...(cubeOfficeProfile.windowsConfig.bundle?.windows?.nsis ?? {}),
					// Huawei's installer spec: land on a data disk, put the
					// disk choice and the shortcut / startup checkboxes on the
					// first page. See the template for the marked changes.
					template: fromHere("./nsis/installer.nsi"),
					// A mainland-China-only channel, and the template's own
					// labels are Chinese, so the installer speaks one language.
					languages: ["SimpChinese"],
					displayLanguageSelector: false,
				},
			},
		},
	},
};

export const profiles = {
	cubeoffice: cubeOfficeProfile,
	"cubeoffice-huawei": huaweiWindowsProfile,
};
export const defaultProfile = "cubeoffice";

// Distribution channel names the build scripts accept, and the profile each one
// selects. `--channel huawei` reads better on a build command than the profile id.
const channelProfiles = { direct: "cubeoffice", huawei: "cubeoffice-huawei" };

export function resolveDesktopAppProfileId(profileId) {
	const normalized = typeof profileId === "string" ? profileId.trim().toLowerCase() : "";
	if (!normalized) return defaultProfile;
	const resolved = channelProfiles[normalized] ?? normalized;
	if (resolved in profiles) return resolved;
	throw new Error(
		`Unknown CubeOffice desktop profile "${normalized}". Profiles: ${Object.keys(profiles).join(", ")}; channels: ${Object.keys(channelProfiles).join(", ")}.`,
	);
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
