/**
 * Renders the template gallery from /templates/index.json -- the same catalog
 * the CubeOffice desktop app reads, so the page and the in-app picker can never
 * disagree about what is published.
 *
 * The catalog carries both languages. i18n.js translates static text by its
 * Chinese source string, which cannot reach text created here, so this script
 * follows `documentElement.dataset.language` and re-renders on a change.
 */
const grid = document.querySelector("[data-template-grid]");
const status = document.querySelector("[data-template-status]");

const COPY = {
	zh: {
		loading: "正在加载模板…",
		failed: "模板列表暂时无法加载，请稍后重试。",
		empty: "暂时还没有发布模板。",
		slides: (count) => `${count} 页`,
		download: { en: "English", "zh-CN": "中文" },
		downloadLabel: (name, language) => `下载 ${name}（${language}）`,
	},
	en: {
		loading: "Loading templates…",
		failed: "The template list could not be loaded. Please try again later.",
		empty: "No templates have been published yet.",
		slides: (count) => `${count} slides`,
		download: { en: "English", "zh-CN": "Chinese" },
		downloadLabel: (name, language) => `Download ${name} (${language})`,
	},
};

let catalog = null;
let failed = false;

function language() {
	return document.documentElement.dataset.language === "en" ? "en" : "zh";
}

/** The catalog's locale key for the page's current language. */
function localeKey() {
	return language() === "en" ? "en" : "zh-CN";
}

function localized(value) {
	if (typeof value === "string") return value;
	if (!value || typeof value !== "object") return "";
	return value[localeKey()] ?? value.en ?? Object.values(value)[0] ?? "";
}

function card(template, copy) {
	const article = document.createElement("article");
	article.className = "template-card";

	const figure = document.createElement("figure");
	if (template.preview) {
		const image = document.createElement("img");
		image.src = template.preview;
		image.alt = "";
		image.loading = "lazy";
		image.width = 1280;
		image.height = 720;
		figure.append(image);
	}

	const body = document.createElement("div");
	body.className = "template-card-body";

	const name = localized(template.name);
	const heading = document.createElement("h3");
	heading.textContent = name;

	const meta = document.createElement("p");
	meta.className = "template-card-meta";
	meta.textContent = [localized(template.category), copy.slides(template.slides ?? 0)]
		.filter(Boolean)
		.join(" · ");

	const description = document.createElement("p");
	description.textContent = localized(template.description);

	const downloads = document.createElement("div");
	downloads.className = "template-card-downloads";
	for (const [locale, file] of Object.entries(template.files ?? {})) {
		const url = typeof file === "string" ? file : file?.url;
		if (!url) continue;
		const label = copy.download[locale] ?? locale;
		const link = document.createElement("a");
		link.className = "template-download";
		link.href = url;
		link.textContent = label;
		link.setAttribute("aria-label", copy.downloadLabel(name, label));
		// The catalog publishes the file name; keep it on download.
		link.download = "";
		downloads.append(link);
	}

	body.append(heading, meta, description, downloads);
	article.append(figure, body);
	return article;
}

function render() {
	if (!grid || !status) return;
	const copy = COPY[language()];
	if (failed) {
		status.textContent = copy.failed;
		status.hidden = false;
		return;
	}
	if (!catalog) {
		status.textContent = copy.loading;
		status.hidden = false;
		return;
	}
	const templates = Array.isArray(catalog.templates) ? catalog.templates : [];
	grid.replaceChildren(...templates.map((template) => card(template, copy)));
	status.textContent = templates.length ? "" : copy.empty;
	status.hidden = templates.length > 0;
}

async function load() {
	try {
		const response = await fetch("/templates/index.json", { cache: "no-cache" });
		if (!response.ok) throw new Error(String(response.status));
		catalog = await response.json();
	} catch {
		failed = true;
	}
	render();
}

if (grid && status) {
	render();
	void load();
	new MutationObserver(render).observe(document.documentElement, {
		attributeFilter: ["data-language"],
	});
}
