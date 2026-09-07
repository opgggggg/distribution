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
			"CubeOffice is a cross-platform AI document app for macOS, Windows, Linux, and Android, built to work with the AI assistant you already use.",
		text: {
			...sharedText,
			"CubeOffice 下载": "Download CubeOffice",
			"移动预览版 · 1.2.1": "Mobile preview · 1.2.1",
			"手机与平板 · Android 8.0+": "Phones and tablets · Android 8.0+",
			"Android 8.0+ · 预览版 1.2.1": "Android 8.0+ · Preview 1.2.1",
			"为手机和平板设计的触控界面，本地编辑与草稿保存。":
				"Touch controls for phones and tablets, with local editing and draft saving.",
			"下载 APK": "Download APK",
			"通用 APK": "Universal APK",
			模板: "Templates",
			支持平台: "Platforms",
			产品能力: "Features",
			支持格式: "Formats",
			"AI 协作": "AI collaboration",
			"通用 AI 的": "A document workspace",
			文档工作台: "for any AI assistant",
			"连接你常用的 AI 应用，在同一个工作区中处理 Word、PowerPoint、Excel、Visio 与 Markdown。让 AI 理解当前文档，并协助生成、改写、整理与编辑内容。":
				"Connect the AI app you already use and work with Word, PowerPoint, Excel, Visio, and Markdown in one place. Give your assistant document context so it can help create, rewrite, organize, and edit content.",
			下载应用: "Download app",
			下载桌面版: "Download desktop app",
			"了解 AI 协作": "See how AI collaboration works",
			"CubeOffice 1.2.1 · macOS、Windows 与 Linux":
				"CubeOffice 1.2.1 · macOS, Windows, and Linux",
			"桌面版 1.2.1 · Android 预览版 1.2.1": "Desktop 1.2.1 · Android preview 1.2.1",
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
			从桌面延伸到手机: "from desktop to mobile",
			覆盖三大桌面平台: "across three desktop platforms",
			"在 macOS、Windows 与 Linux 上处理桌面工作，在 Android 手机上随时阅读和编辑文档。":
				"Work on macOS, Windows, and Linux, then read and edit documents on your Android phone.",
			"围绕同一套文档能力与交互逻辑构建，在 macOS、Windows 与 Linux 之间保持一致的工作节奏。":
				"The same document capabilities and interaction model keep your workflow consistent across macOS, Windows, and Linux.",
			"桌面版本 · 1.2.1": "Desktop release · 1.2.1",
			"AppImage 与 DEB": "AppImage and DEB",
			选择你的平台: "Choose your platform",
			选择你的桌面平台: "Choose your desktop platform",
			"安装包直接从 cubexp.com 下载。桌面版支持应用内更新；Android 预览版通过 APK 安装。":
				"Download directly from cubexp.com. Desktop apps support in-app updates; install the Android preview using its APK.",
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
			"CubeOffice 1.2.1 桌面版和 Android 1.2.1 预览版现已开放下载。":
				"CubeOffice 1.2.1 desktop apps and the Android 1.2.1 preview are available now.",
			"macOS、Windows 与 Linux 桌面版现已开放下载。":
				"CubeOffice 1.2.1 is available for macOS, Windows, and Linux.",
		},
		attributes: {
			"CubeOffice 首页": "CubeOffice home",
			主要导航: "Main navigation",
			产品状态: "Product availability",
			支持的文档格式: "Supported document formats",
			"AI 协作流程": "AI collaboration workflow",
		},
	},
	visio: {
		title: "Visio editor for Mac and Linux | CubeOffice",
		description:
			"Open, view, edit, and save Microsoft Visio VSDX files on macOS and Linux with CubeOffice. Work with flowcharts, org charts, connectors, Shape Data, VSSX stencils, and draw.io imports.",
		text: {
			...sharedText,
			"Mac 与 Linux": "Mac & Linux",
			编辑能力: "Editing",
			兼容性: "Compatibility",
			常见问题: "FAQ",
			"在 Mac 与 Linux 上，": "Edit Visio directly",
			"直接编辑 Visio": "on Mac and Linux",
			"无需切换到 Windows，也无需先把图表转成图片。CubeOffice 可直接打开、查看、编辑并保存 Microsoft Visio 的 VSDX 文件，让流程图、组织结构图和技术图表留在原生格式中。":
				"No Windows switch and no image conversion. CubeOffice opens, views, edits, and saves Microsoft Visio VSDX files directly, keeping flowcharts, org charts, and technical diagrams in their native format.",
			"下载 macOS / Linux 版": "Download for macOS / Linux",
			"查看 Visio 功能": "Explore Visio features",
			原生打开与保存: "Open and save natively",
			图形库导入与导出: "Import and export stencils",
			导入为可编辑图表: "Import as an editable diagram",
			"CubeOffice 在 macOS 上打开并编辑真实 VSDX 经典流程图":
				"CubeOffice opening and editing a real classic VSDX flowchart on macOS",
			"跨平台 Visio 工作流": "Cross-platform Visio workflow",
			"把 VSDX 带到 Windows 之外": "Take VSDX beyond Windows",
			"同一套图表编辑能力运行在三个桌面平台。文件留在本地，团队仍可继续使用标准 VSDX 交付。":
				"The same diagram editing capabilities run across all three desktop platforms. Files stay local while your team continues to deliver standard VSDX documents.",
			"macOS 上不再只看预览": "Go beyond previews on macOS",
			"在 Apple Silicon Mac 上打开 VSDX，选择图形、修改文字、调整连接线与布局，然后保存回可继续编辑的 Visio 文件。":
				"Open VSDX on an Apple Silicon Mac, select shapes, edit text, adjust connectors and layouts, then save an editable Visio file.",
			"Linux 也能参与图表协作": "Bring Linux into diagram workflows",
			"在 Debian、Ubuntu 及支持 AppImage 的 x86_64 Linux 环境中处理 VSDX，无需远程桌面或 Windows 虚拟机。":
				"Work with VSDX on Debian, Ubuntu, and x86_64 Linux systems that support AppImage—without a remote desktop or Windows virtual machine.",
			文件默认在设备本地处理: "Local processing by default",
			"打开、编辑和保存主要在本机完成。只有当你主动连接 AI 并选择上下文时，相关内容才交给所连接的 AI 应用。":
				"Opening, editing, and saving happen primarily on your device. Content is provided to a connected AI app only when you choose to connect it and share context.",
			无需注册登录: "No account required",
			"不只是 VSDX 查看器": "More than a VSDX viewer",
			"从打开，到真正完成修改": "From opening a file to finishing the edit",
			"覆盖日常流程图、组织结构图、业务流程和技术图表所需的核心编辑工作。":
				"Core editing tools for everyday flowcharts, org charts, business processes, and technical diagrams.",
			"图形、文本与连接线": "Shapes, text, and connectors",
			"插入内置图形和文本框，编辑形状文字，连接节点，并设置线条、箭头、填充、旋转、翻转、组合与层级。":
				"Insert built-in shapes and text boxes, edit shape text, connect nodes, and control lines, arrows, fills, rotation, flipping, grouping, and z-order.",
			排列与自动布局: "Arrange and auto-layout",
			"对齐、等距分布和精确定位图形，并预览流程、层级、放射和环形布局。":
				"Align, distribute, and position shapes precisely, with previewable flowchart, hierarchy, radial, and circular layouts.",
			多页面与页面设计: "Multi-page design",
			"管理多页图表、背景页、主题、纸张尺寸与方向，并使用网格、参考线、吸附和粘附。":
				"Manage multi-page diagrams, background pages, themes, paper size and orientation, plus grids, guides, snap, and glue.",
			"Shape Data 与数据图形": "Shape Data and data graphics",
			"读取和编辑类型化 Shape Data，使用文本、数据条、图标和颜色展示数据，并支持 CSV 导入。":
				"Read and edit typed Shape Data, visualize it with text, data bars, icons, and colors, and import data from CSV.",
			图形库与模板: "Stencils and templates",
			"搜索基本图形、流程图、BPMN 和组织结构图目录，也可导入或导出 VSSX 图形库。":
				"Search Basic, Flowchart, BPMN, and Org Chart catalogs, or import and export VSSX stencil libraries.",
			"AI 理解图表结构": "AI understands diagram structure",
			"让兼容的 AI 应用读取页面、图形和连接关系，并协助添加节点、修改文字、整理结构或重新布局；每次修改仍可检查和撤销。":
				"Let a compatible AI app read pages, shapes, and connections, then help add nodes, edit text, organize structure, or re-layout the diagram. Every change remains reviewable and undoable.",
			格式兼容与安全边界: "Compatibility and security boundaries",
			"保留原文件结构，明确处理边界": "Preserve source structure with clear boundaries",
			"CubeOffice 使用源结构保留的 VSDX 写入方式。未被编辑器主动修改的包内容会尽可能保留，便于文件继续回到其他 Visio 工作流。":
				"CubeOffice uses a source-preserving VSDX writer. Package content that the editor does not actively change is preserved where possible, so files can return to other Visio workflows.",
			"原生 VSDX 读写": "Native VSDX read and write",
			"打开现有文件、创建新图表，并保存为标准 VSDX。":
				"Open existing files, create new diagrams, and save standard VSDX documents.",
			安全保留高级内容: "Safely preserve advanced content",
			"VBA、OLE、ActiveX 和插件内容可被保留和提示，但不会在 CubeOffice 中执行。":
				"VBA, OLE, ActiveX, and add-in content can be preserved and reported, but is never executed in CubeOffice.",
			确定性跨平台渲染: "Consistent cross-platform rendering",
			"Mac、Linux 与 Windows 使用一致的浏览器渲染；不承诺与 Windows 版 Visio 像素级一致。":
				"Mac, Linux, and Windows use the same deterministic browser rendering; pixel-identical output with Visio for Windows is not promised.",
			现代格式优先: "Modern format first",
			"核心编辑格式是 VSDX；旧版二进制 VSD 文件不属于当前完整编辑范围。":
				"VSDX is the primary editing format. Legacy binary VSD files are not currently covered by the full editing experience.",
			"关于 Mac、Linux 与 Visio": "About Mac, Linux, and Visio",
			"Mac 上可以直接编辑 Visio 文件吗？": "Can I edit Visio files directly on a Mac?",
			"可以。CubeOffice 的 macOS 版可以打开、编辑并保存 VSDX 文件，包括常见图形、文本、连接线、多页面和布局操作。目前提供 Apple Silicon 版本。":
				"Yes. CubeOffice for macOS opens, edits, and saves VSDX files, including common shapes, text, connectors, multiple pages, and layout operations. An Apple Silicon build is currently available.",
			"Linux 上需要安装 Microsoft Office 或 Wine 吗？":
				"Does Linux require Microsoft Office or Wine?",
			"不需要。CubeOffice 以原生桌面应用提供 AppImage 和 DEB 安装包，不依赖 Microsoft Office、Wine 或 Windows 虚拟机。":
				"No. CubeOffice is a native desktop application available as AppImage and DEB packages. It does not require Microsoft Office, Wine, or a Windows virtual machine.",
			"保存后能回到 Microsoft Visio 继续编辑吗？":
				"Can I continue editing the saved file in Microsoft Visio?",
			"CubeOffice 保存标准 VSDX 文件，并采用源结构保留策略。复杂专有功能可能存在显示差异，重要文件建议保留原始副本并在交付前复核。":
				"CubeOffice saves standard VSDX files with a source-preserving strategy. Complex proprietary features may render differently, so keep the original and review important files before delivery.",
			"支持哪些 Visio 图表类型？": "Which Visio diagram types are supported?",
			"内置基本图形、流程图、BPMN 和组织结构图目录，也支持从文档主控形状与 VSSX 图形库插入内容。":
				"Built-in catalogs cover Basic, Flowchart, BPMN, and Org Chart shapes, with insertion from document masters and VSSX stencil libraries.",
			"可以把 draw.io 文件变成 Visio 文件吗？":
				"Can I turn a draw.io file into a Visio file?",
			"可以导入 draw.io 内容并转换为可编辑的图表模型，之后保存为 VSDX。复杂图形在转换后建议人工检查。":
				"You can import draw.io content into an editable diagram model and then save it as VSDX. Review complex diagrams after conversion.",
			"让 Mac 与 Linux 真正加入 Visio 工作流": "Bring Mac and Linux into your Visio workflow",
			"下载桌面版，直接开始处理 VSDX 图表。":
				"Download the desktop app and start working with VSDX diagrams.",
			选择下载版本: "Choose a download",
			返回首页: "Back to home",
		},
		attributes: {
			"CubeOffice 首页": "CubeOffice home",
			"Visio 页面导航": "Visio page navigation",
			"Visio 核心支持": "Core Visio support",
			"CubeOffice 在 macOS 上打开并编辑真实 VSDX 经典流程图":
				"CubeOffice opening and editing a real classic VSDX flowchart on macOS",
		},
	},
	templates: {
		title: "Free PowerPoint templates | CubeOffice originals",
		description:
			"Eight original CubeOffice PowerPoint templates, free to download, edit and redistribute. 16:9, thirteen slides each, in English and Chinese, and selectable when you create a new PPTX in CubeOffice.",
		text: {
			...sharedText,
			"CubeOffice 原创模板": "CubeOffice originals",
			模板库: "Template library",
			在应用中使用: "Use them in the app",
			授权说明: "Licence",
			不必从空白页开始: "You do not have to start from a blank page",
			"8 套为 CubeOffice 从零设计的演示文稿模板。每套 16:9、共 13 页，包含封面、目录、章节页、要点页、数据页、时间线、表格、图文页与结尾页，并提供中文与英文两个版本。免费下载，也可自由再分发。":
				"Eight presentation templates designed for CubeOffice from scratch. Each is 16:9 and thirteen slides — cover, contents, section dividers, a lead page, figures, a timeline, a table, an image page and a closing page — in both English and Chinese. Free to download and free to redistribute.",
			浏览模板: "Browse templates",
			"下载 CubeOffice": "Download CubeOffice",
			"选择语言版本后直接下载 .pptx 文件，可在 CubeOffice、PowerPoint、Keynote 或 WPS 中打开编辑。":
				"Pick a language and download the .pptx directly. The files open and edit in CubeOffice, PowerPoint, Keynote and WPS.",
			"正在加载模板…": "Loading templates…",
			"在 CubeOffice 里直接选用": "Pick one inside CubeOffice",
			"桌面版新建演示文稿时会列出这些模板，按界面语言给出对应语种的版本，无需事先下载。":
				"The desktop app lists these templates when you create a presentation, in the language the interface is set to, with no download step first.",
			"点击「新建」": "Click New",
			"在标题栏的新建菜单中选择 PowerPoint 演示文稿。":
				"Choose PowerPoint presentation from the New menu in the title bar.",
			选择模板: "Choose a template",
			"模板库会即时从本页读取同一份清单，第一项始终是空白演示文稿。":
				"The picker reads the same catalog this page does, and a blank presentation is always the first choice.",
			开始编辑: "Start editing",
			"模板以未命名文档打开，保存时由你决定文件名和位置，原模板不受影响。":
				"The template opens as an unnamed document, so saving asks you where it goes and the template itself is untouched.",
			"这些模板是 CubeOffice 的原创作品：版式、配色、字体搭配、装饰图形与示例文案均为自行设计与生成。模板中不包含任何第三方模板的版式或素材，也不包含照片、图标集或字体文件。":
				"These templates are CubeOffice's own work: the layouts, palettes, type pairings, decorative shapes and placeholder copy were all designed and generated for this set. No template contains a layout or asset taken from a third-party template, and none contains a photograph, icon set or font file.",
			"你可以自由使用、修改和再分发，用于个人或商业用途，无需署名。示例文案仅作占位提示，其中的数字、名称与结论均为虚构，请替换为你自己的内容。":
				"You may use, edit and redistribute them for personal and commercial work, with or without attribution. The placeholder copy is there to show what belongs in each slot; its figures, names and conclusions are invented, so replace them with your own.",
			"模板正文使用 Georgia、Arial、Trebuchet MS、Verdana 与 Times New Roman 等 Windows 与 macOS 均已内置的字体，中日韩字符交由系统字体回退处理，因此模板不附带任何字体文件。":
				"The templates set only faces that ship with both Windows and macOS — Georgia, Arial, Trebuchet MS, Verdana and Times New Roman — and leave CJK characters to the reader's system font, which is why no font file is bundled.",
			"CubeOffice 1.2.1": "CubeOffice 1.2.1",
			新建演示文稿时就能选模板: "Choose a template as you create the presentation",
			"下载桌面版，从「新建」菜单直接开始。":
				"Download the desktop app and start from the New menu.",
			选择下载版本: "Choose a download",
			返回首页: "Back to home",
		},
		attributes: {
			"CubeOffice 首页": "CubeOffice home",
			模板页面导航: "Template page navigation",
		},
	},
	privacy: {
		title: "Privacy Policy | CubeOffice",
		description: "CubeOffice Privacy Policy for macOS, Windows, Linux, and Android",
		text: {
			...sharedText,
			返回首页: "Back to home",
			生效日期: "Effective date",
			"2026 年 9 月 7 日": "September 7, 2026",
			运营者: "Operator",
			隐私与数据保护: "Privacy and data protection",
			"CubeOffice 隐私政策": "CubeOffice Privacy Policy",
			"我们重视您的隐私。本政策适用于 CubeOffice 的 macOS、Windows、Linux 与 Android 版本，并说明应用如何处理数据。CubeOffice 当前无需注册或登录，文档主要在您的设备本地处理。":
				"We value your privacy. This policy applies to the macOS, Windows, Linux, and Android versions of CubeOffice and explains how the app handles data. CubeOffice currently requires no registration or sign-in, and documents are primarily processed on your device.",
			"1. 我们处理的信息": "1. Information we process",
			"当您主动选择打开、导入、创建或编辑文档时，应用会在您的设备上处理相应文件及其内容，以提供文档查看、编辑、保存、撤销和多标签工作区等功能。":
				"When you choose to open, import, create, or edit a document, the app processes that file and its contents on your device to provide viewing, editing, saving, undo, and multi-tab workspace features.",
			"这些文档可能包含您自行写入的文字、表格、图片或其他内容。CubeOffice 不会将文档内容上传至我们运营的服务器。":
				"These documents may contain text, tables, images, or other content you provide. CubeOffice does not upload document contents to servers operated by us.",
			"2. 设备权限": "2. Device permissions",
			"应用仅在您主动选择文件、打开文件或保存文件时，通过所在操作系统提供的文件选择与存储能力访问相应内容。我们不会在未经您操作的情况下扫描其他文件。":
				"The app accesses content through the operating system’s file selection and storage capabilities only when you choose, open, or save a file. We do not scan other files without your action.",
			"Android 版本仅声明网络权限，用于您主动检查更新、启用自动更新检查或提交反馈。文档访问通过 Android 系统文件选择器授予的单次或持久化授权完成；应用不会请求读取设备全部照片、媒体或文件的权限。":
				"The Android version declares only network access, used when you check for updates, enable automatic update checks, or submit feedback. Documents are accessed through one-time or persistent grants from the Android system file picker; the app does not request permission to read all photos, media, or files on the device.",
			"3. 本地保存与删除": "3. Local storage and deletion",
			"文档、编辑状态和自动恢复数据保存在您的设备本地，保存期限由您对文件和应用数据的管理决定。您可以删除文档、清除应用数据或卸载应用来移除本地数据。":
				"Documents, editing state, and recovery data are stored locally on your device. Their retention depends on how you manage files and app data. You can remove local data by deleting documents, clearing app data, or uninstalling the app.",
			"Android 版本会在应用私有存储中保存设置、匿名安装 ID、编辑草稿和必要的临时文件；保存到外部位置时，由您通过系统保存界面选择目标。Android 系统可能根据您的设备备份设置备份符合条件的应用数据，匿名安装 ID 明确排除在系统备份之外。":
				"The Android version stores settings, an anonymous installation ID, editing drafts, and necessary temporary files in private app storage. When saving externally, you choose the destination through the system save interface. Android may back up eligible app data according to your device backup settings; the anonymous installation ID is explicitly excluded from system backup.",
			"4. 匿名使用数据、诊断与反馈": "4. Anonymous usage data, diagnostics, and feedback",
			"应用会随机生成一个匿名安装 ID，不读取硬件序列号。桌面版的自动更新检查和错误诊断默认开启，可随时在设置中关闭；Android 版的自动更新检查默认关闭，由您自行启用。每次检查更新会发送匿名 ID、应用版本、平台、架构和语言；Android 版还会发送版本代码和系统 SDK 版本。这些信息用于更新兼容性判断和按日去重统计活跃设备；我们不保存原始 IP 地址。":
				"The app generates a random anonymous installation ID without reading a hardware serial number. Automatic update checks and error diagnostics are enabled by default on desktop and can be disabled in Settings; automatic update checks are disabled by default on Android and can be enabled by you. Each update check sends the anonymous ID, app version, platform, architecture, and language. Android also sends the version code and system SDK version. This information is used for update compatibility and deduplicated daily active-device counts. We do not store raw IP addresses.",
			"在启用错误诊断的平台版本中，应用可能上传已脱敏的错误消息、调用栈和基础系统信息，绝不附带文档或文档内容，诊断日志保存 30 天。您也可主动提交问题、建议或咨询，并自行选择是否提供联系方式、系统信息和截图；反馈记录会保留至完成处理或按您的请求删除。":
				"On platform versions where diagnostics are enabled, the app may upload redacted error messages, stack traces, and basic system information. Documents and document contents are never attached. Diagnostic logs are retained for 30 days. You may also submit a problem, suggestion, or question and choose whether to include contact details, system information, and a screenshot. Feedback is retained until it is handled or deleted at your request.",
			"5. AI 应用连接与平台能力": "5. AI app connections and platform capabilities",
			"CubeOffice 可以连接兼容的 AI 应用。当您主动发起 AI 操作时，相关指令及您选择提供的文档上下文可能由所连接的 AI 应用处理，以生成或执行您请求的结果。该 AI 应用对数据的处理受其自身隐私政策约束。不同平台版本也可能调用操作系统提供的标准文件、自动化、桌面或移动端能力。":
				"CubeOffice can connect to compatible AI apps. When you initiate an AI action, the connected AI app may process the instruction and the document context you choose to provide in order to generate or perform the requested result. That app’s handling of data is governed by its own privacy policy. Platform versions may also use standard file, automation, desktop, or mobile capabilities provided by the operating system.",
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
