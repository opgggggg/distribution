const STORAGE_KEY = "cubeoffice-language";

const sharedText = {
	跳到主要内容: "Skip to main content",
	下载: "Download",
	隐私政策: "Privacy",
	打开导航: "Open navigation",
	"CubeOffice 首页": "CubeOffice home",
};

const pageCopy = {
	home: {
		title: "CubeOffice | Cross-platform document workspace",
		description:
			"CubeOffice is a cross-platform AI document app for macOS, Windows, and Linux, built to work with the AI assistant you already use.",
		text: {
			...sharedText,
			支持平台: "Platforms",
			产品能力: "Features",
			支持格式: "Formats",
			"AI 协作": "AI collaboration",
			"通用 AI 的": "A document workspace",
			文档工作台: "for any AI assistant",
			"连接你常用的 AI 应用，在同一个工作区中处理 Word、PowerPoint、Excel、Visio 与 Markdown。让 AI 理解当前文档，并协助生成、改写、整理与编辑内容。":
				"Connect the AI app you already use and work with Word, PowerPoint, Excel, Visio, and Markdown in one place. Give your assistant document context so it can help create, rewrite, organize, and edit content.",
			下载桌面版: "Download desktop app",
			"了解 AI 协作": "See how AI collaboration works",
			"CubeOffice 1.2.0 · macOS、Windows 与 Linux":
				"CubeOffice 1.2.0 · macOS, Windows, and Linux",
			"AI 已连接": "AI connected",
			文件: "File",
			插入: "Insert",
			布局: "Layout",
			审阅: "Review",
			视图: "View",
			文档助手: "Document assistant",
			基于当前文档: "Using this document",
			"把这页总结改写得更清晰，并突出关键数据。":
				"Rewrite this summary for clarity and highlight the key figures.",
			"已完成 · 可撤销": "Done · Undo available",
			"CubeOffice 通用 AI 文档工作台界面示意":
				"Illustration of the CubeOffice document workspace connected to an AI app",
			"一次熟悉，处处顺手": "Familiar everywhere",
			"一套体验，": "One experience,",
			覆盖三大桌面平台: "across three desktop platforms",
			"围绕同一套文档能力与交互逻辑构建，在 macOS、Windows 与 Linux 之间保持一致的工作节奏。":
				"The same document capabilities and interaction model keep your workflow consistent across macOS, Windows, and Linux.",
			"桌面版本 · 1.2.0": "Desktop release · 1.2.0",
			"AppImage 与 DEB": "AppImage and DEB",
			选择你的桌面平台: "Choose your desktop platform",
			"安装包直接从 cubexp.com 下载。应用内更新使用同一域名上的签名更新服务。":
				"Installers download directly from cubexp.com. In-app updates use the signed update service on the same domain.",
			"适用于 Apple Silicon（M 系列芯片）": "For Apple Silicon (M-series chips)",
			"下载 DMG": "Download DMG",
			"约 15 MB": "About 15 MB",
			"适用于 64 位 Intel 与 AMD 电脑": "For 64-bit Intel and AMD PCs",
			下载安装器: "Download installer",
			"便携 AppImage 或 Debian / Ubuntu 安装包":
				"Portable AppImage or Debian / Ubuntu package",
			"首次安装时系统可能提示未识别开发者。你可以先核对":
				"Your system may warn about an unidentified developer on first install. You can verify the",
			"SHA-256 校验值": "SHA-256 checksums",
			"；当前 macOS 版本尚未公证，Windows 安装包尚未购买代码签名证书。":
				". The current macOS build is not yet notarized, and the Windows installer is not yet code-signed.",
			一个工作区: "One workspace",
			"熟悉的格式，都在这里": "Your familiar formats, all in one place",
			完整的桌面工作区: "A complete desktop workspace",
			"从内容编辑，到跨格式协作": "From document editing to cross-format workflows",
			"CubeOffice 把文档解析、编辑、保存与 AI 操作放在同一个工作区，让不同格式沿用一致的工作方式。":
				"CubeOffice brings document parsing, editing, saving, and AI actions into one workspace, with a consistent workflow across formats.",
			原生格式编辑: "Native-format editing",
			"直接编辑 Word 段落与表格、Excel 单元格、PowerPoint 幻灯片与图形、Visio 图表和 Markdown 源文档。":
				"Edit Word paragraphs and tables, Excel cells, PowerPoint slides and shapes, Visio diagrams, and Markdown source documents directly.",
			跨格式打开与导入: "Open and import across formats",
			"除常见办公格式外，还可读取 PDF，并导入 JMP 和 draw.io 内容，减少在工具之间反复转换。":
				"Alongside common office formats, read PDFs and import JMP and draw.io content with fewer conversions between tools.",
			多标签工作区: "Multi-tab workspace",
			"多个文档保留在同一个工作区，随时切换文字、表格、演示文稿与图表，不打断当前任务。":
				"Keep multiple documents in one workspace and move between text, spreadsheets, presentations, and diagrams without interrupting the task.",
			本地文件优先: "Local files first",
			"文档主要在设备本地打开、编辑和保存；只有在你主动使用 AI 时，才向所连接的应用提供你选择的上下文。":
				"Documents are opened, edited, and saved primarily on your device. Context is provided to a connected AI app only when you choose to use it.",
			自动保存与恢复: "Autosave and recovery",
			"编辑状态与恢复数据保存在本地，减少意外中断带来的损失，也方便回到未完成的工作。":
				"Editing state and recovery data stay local, reducing loss after an interruption and making it easier to resume unfinished work.",
			"可追踪、可撤销": "Traceable and undoable",
			"AI 执行的文档操作会显示在活动记录中；结果仍可继续手动编辑、保存或撤销。":
				"Document actions performed by AI appear in the activity log, and every result remains available for manual editing, saving, or undo.",
			"AI 与文档协同": "AI and documents, together",
			"四步，把想法变成文档修改": "Four steps from intent to document edits",
			"你继续在熟悉的 AI 应用中对话，CubeOffice 负责提供文档能力、执行操作，并把结果留在可编辑的文件中。":
				"Keep talking in the AI app you already use. CubeOffice provides document capabilities, performs the actions, and leaves the result in an editable file.",
			打开需要处理的文档: "Open the document you want to work on",
			"CubeOffice 建立当前文件、页面或选区的结构化上下文。":
				"CubeOffice builds structured context for the current file, page, or selection.",
			"连接兼容的 AI 应用": "Connect a compatible AI app",
			"连接后，AI 可以发现当前文档支持的读取与编辑能力。":
				"Once connected, the AI can discover the reading and editing capabilities available for the current document.",
			用自然语言描述结果: "Describe the outcome in natural language",
			"让 AI 重写摘要、更新单元格、统一幻灯片标题或整理流程图。":
				"Ask AI to rewrite a summary, update cells, standardize slide titles, or organize a flowchart.",
			检查并决定是否保留: "Review and decide what to keep",
			"结果直接回到文档；你可以继续手动编辑、保存或撤销。":
				"The result goes straight back into the document, where you can keep editing, save it, or undo the change.",
			"一次请求，多步完成": "One request, completed in multiple steps",
			"AI 调用 CubeOffice 的文档操作": "AI calls CubeOffice document actions",
			"“整理这份会议记录，提取决定事项和负责人，再生成一个行动表格。”":
				"“Organize these meeting notes, extract the decisions and owners, then create an action table.”",
			"读取标题、段落与现有表格": "Read headings, paragraphs, and existing tables",
			完成: "Done",
			"重组会议记录并提取 4 项待办": "Restructure the notes and extract 4 action items",
			"插入负责人、截止时间与状态表格": "Insert a table with owners, deadlines, and status",
			"通用 AI 应用连接与文档协作界面示意":
				"Illustration of document collaboration through a connected AI app",
			"不同文档，同一种协作方式": "One collaboration model across document types",
			"改写段落、整理标题与表格": "Rewrite paragraphs and organize headings and tables",
			"读取区域、更新单元格与公式": "Read ranges and update cells and formulas",
			"统一文案、调整幻灯片与图形": "Standardize copy and adjust slides and shapes",
			读取与编辑图表结构: "Read and edit diagram structure",
			"重组 Markdown 内容与层级": "Restructure Markdown content and hierarchy",
			"不同文档格式的 AI 协作任务示意":
				"Examples of AI collaboration tasks across document formats",
			"让熟悉的 AI，真正参与文档工作": "Bring the AI you know into real document work",
			"macOS、Windows 与 Linux 桌面版现已开放下载。":
				"CubeOffice 1.2.0 is available for macOS, Windows, and Linux.",
		},
		attributes: {
			"CubeOffice 首页": "CubeOffice home",
			主要导航: "Main navigation",
			产品状态: "Product availability",
			支持的文档格式: "Supported document formats",
			"AI 协作流程": "AI collaboration workflow",
		},
	},
	privacy: {
		title: "Privacy Policy | CubeOffice",
		description: "CubeOffice Privacy Policy",
		text: {
			...sharedText,
			返回首页: "Back to home",
			生效日期: "Effective date",
			"2026 年 9 月 4 日": "September 4, 2026",
			运营者: "Operator",
			隐私与数据保护: "Privacy and data protection",
			"CubeOffice 隐私政策": "CubeOffice Privacy Policy",
			"我们重视您的隐私。本政策适用于 CubeOffice 的 macOS、Windows 与 Linux 版本，并说明应用如何处理数据。CubeOffice 当前无需注册或登录，文档主要在您的设备本地处理。":
				"We value your privacy. This policy applies to the macOS, Windows, and Linux versions of CubeOffice and explains how the app handles data. CubeOffice currently requires no registration or sign-in, and documents are primarily processed on your device.",
			"1. 我们处理的信息": "1. Information we process",
			"当您主动选择打开、导入、创建或编辑文档时，应用会在您的设备上处理相应文件及其内容，以提供文档查看、编辑、保存、撤销和多标签工作区等功能。":
				"When you choose to open, import, create, or edit a document, the app processes that file and its contents on your device to provide viewing, editing, saving, undo, and multi-tab workspace features.",
			"这些文档可能包含您自行写入的文字、表格、图片或其他内容。CubeOffice 不会将文档内容上传至我们运营的服务器。":
				"These documents may contain text, tables, images, or other content you provide. CubeOffice does not upload document contents to servers operated by us.",
			"2. 设备权限": "2. Device permissions",
			"应用仅在您主动选择文件、打开文件或保存文件时，通过所在操作系统提供的文件选择与存储能力访问相应内容。我们不会在未经您操作的情况下扫描其他文件。":
				"The app accesses content through the operating system’s file selection and storage capabilities only when you choose, open, or save a file. We do not scan other files without your action.",
			"3. 本地保存与删除": "3. Local storage and deletion",
			"文档、编辑状态和自动恢复数据保存在您的设备本地，保存期限由您对文件和应用数据的管理决定。您可以删除文档、清除应用数据或卸载应用来移除本地数据。":
				"Documents, editing state, and recovery data are stored locally on your device. Their retention depends on how you manage files and app data. You can remove local data by deleting documents, clearing app data, or uninstalling the app.",
			"4. 匿名使用数据、诊断与反馈": "4. Anonymous usage data, diagnostics, and feedback",
			"应用首次启动时会随机生成一个匿名安装 ID（不读取硬件序列号），并让您选择是否自动检查更新和上传错误诊断，这两个选项默认开启且可随时在设置中关闭。每次检查更新会发送该匿名 ID、应用版本、平台、架构和语言，用于按日去重统计活跃设备；我们不保存原始 IP 地址。":
				"On first launch, the app generates a random anonymous installation ID without reading a hardware serial number. You can choose whether to check for updates and send error diagnostics automatically; both options are enabled by default and can be disabled in Settings at any time. Each update check sends the anonymous ID, app version, platform, architecture, and language to count daily active installations. We do not store raw IP addresses.",
			"开启错误诊断后，应用可能上传已脱敏的错误消息、调用栈和基础系统信息，绝不附带文档或文档内容，诊断日志保存 30 天。您也可主动提交问题、建议或咨询，并自行选择是否提供联系方式、系统信息和截图；反馈记录会保留至完成处理或按您的请求删除。":
				"When diagnostics are enabled, the app may upload redacted error messages, stack traces, and basic system information. Documents and document contents are never attached. Diagnostic logs are retained for 30 days. You may also submit a problem, suggestion, or question and choose whether to include contact details, system information, and a screenshot. Feedback is retained until it is handled or deleted at your request.",
			"5. AI 应用连接与平台能力": "5. AI app connections and platform capabilities",
			"CubeOffice 可以连接兼容的 AI 应用。当您主动发起 AI 操作时，相关指令及您选择提供的文档上下文可能由所连接的 AI 应用处理，以生成或执行您请求的结果。该 AI 应用对数据的处理受其自身隐私政策约束。不同平台版本也可能调用操作系统提供的标准文件、自动化与桌面能力。":
				"CubeOffice can connect to compatible AI apps. When you initiate an AI action, the connected AI app may process the instruction and the document context you choose to provide in order to generate or perform the requested result. That app’s handling of data is governed by its own privacy policy. Platform versions may also use standard file, automation, and desktop capabilities provided by the operating system.",
			"6. 第三方共享与商业用途": "6. Third-party sharing and commercial use",
			"除您主动连接并调用的 AI 应用外，我们不会主动向第三方共享您的文档内容。我们不会出售您的个人信息，也不会将文档内容用于广告或个性化推荐。法律法规另有要求的除外。":
				"Except for an AI app that you choose to connect and invoke, we do not proactively share document contents with third parties. We do not sell your personal information or use document contents for advertising or personalized recommendations, except where required by law.",
			"7. 未成年人保护": "7. Protection of minors",
			"CubeOffice 面向一般用户，不专门面向儿童。监护人应指导未成年人合理使用应用并妥善管理文档内容。":
				"CubeOffice is intended for a general audience and is not specifically directed at children. Guardians should guide minors in using the app appropriately and managing document contents safely.",
			"8. 政策更新": "8. Policy updates",
			"应用功能或法律要求发生变化时，我们可能更新本政策。重要变更会通过应用市场页面、应用内提示或本页面进行说明。":
				"We may update this policy when app features or legal requirements change. Material changes will be communicated through the app marketplace listing, an in-app notice, or this page.",
			"9. 联系我们": "9. Contact us",
			"如对本政策或数据处理有疑问，请通过 cubexp.com 联系我们。":
				"If you have questions about this policy or our data practices, contact us through cubexp.com.",
		},
		attributes: {
			"CubeOffice 首页": "CubeOffice home",
			页面导航: "Page navigation",
			政策信息: "Policy information",
		},
	},
};

const normalize = (value) => value.replace(/\s+/gu, " ").trim();
const page = pageCopy[document.body.dataset.page] ?? pageCopy.home;
const originalText = new Map();
const originalAttributes = new Map();
const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
	acceptNode(node) {
		const parent = node.parentElement;
		if (!parent || parent.matches("script, style, [data-language-label]")) {
			return NodeFilter.FILTER_REJECT;
		}
		return normalize(node.textContent ?? "")
			? NodeFilter.FILTER_ACCEPT
			: NodeFilter.FILTER_REJECT;
	},
});

while (textWalker.nextNode()) {
	const node = textWalker.currentNode;
	originalText.set(node, node.textContent ?? "");
}

for (const element of document.querySelectorAll("[aria-label], [title]")) {
	const values = {};
	for (const name of ["aria-label", "title"]) {
		if (element.hasAttribute(name)) values[name] = element.getAttribute(name);
	}
	originalAttributes.set(element, values);
}

function storedLanguage() {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored === "zh" || stored === "en" ? stored : null;
	} catch {
		return null;
	}
}

function browserLanguage() {
	const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
	return languages[0]?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function translatedText(raw) {
	const key = normalize(raw);
	const translation = page.text[key];
	if (!translation) return raw;
	const leading = raw.match(/^\s*/u)?.[0] ?? "";
	const trailing = raw.match(/\s*$/u)?.[0] ?? "";
	return `${leading}${translation}${trailing}`;
}

function applyLanguage(language, persist = false) {
	const english = language === "en";
	document.documentElement.lang = english ? "en" : "zh-CN";
	document.documentElement.dataset.language = language;
	document.title = english
		? page.title
		: document.querySelector("title")?.dataset.zhTitle || page.title;

	const description = document.querySelector('meta[name="description"]');
	if (description) {
		description.setAttribute(
			"content",
			english ? page.description : description.dataset.zhContent || page.description,
		);
	}

	for (const [node, raw] of originalText) {
		node.textContent = english ? translatedText(raw) : raw;
	}

	for (const [element, values] of originalAttributes) {
		for (const [name, raw] of Object.entries(values)) {
			const translated = english ? page.attributes[raw] || page.text[raw] || raw : raw;
			element.setAttribute(name, translated);
		}
	}

	for (const toggle of document.querySelectorAll("[data-language-toggle]")) {
		const label = toggle.querySelector("[data-language-label]");
		if (label) label.textContent = english ? "中文" : "EN";
		toggle.setAttribute("aria-label", english ? "Switch to Chinese" : "切换到英文");
		toggle.setAttribute("title", english ? "Switch to Chinese" : "切换到英文");
	}

	if (persist) {
		try {
			localStorage.setItem(STORAGE_KEY, language);
		} catch {
			// The language still changes when storage is unavailable.
		}
	}
}

const title = document.querySelector("title");
if (title) title.dataset.zhTitle = title.textContent ?? "";
const description = document.querySelector('meta[name="description"]');
if (description) description.dataset.zhContent = description.getAttribute("content") ?? "";

let currentLanguage = storedLanguage() ?? browserLanguage();
applyLanguage(currentLanguage);

for (const toggle of document.querySelectorAll("[data-language-toggle]")) {
	toggle.addEventListener("click", () => {
		currentLanguage = currentLanguage === "zh" ? "en" : "zh";
		applyLanguage(currentLanguage, true);
	});
}

window.CubeOfficeI18n = {
	get language() {
		return currentLanguage;
	},
	setLanguage(language) {
		if (language !== "zh" && language !== "en") return;
		currentLanguage = language;
		applyLanguage(language, true);
	},
};
