import AppIntents

/// Siri, the Shortcuts app, and Spotlight entry points.
///
/// Each intent produces the same `AssistantCommand` the `cubeoffice://assistant` URL
/// scheme produces, so all of them normalise through one place and reach the Web shell by
/// one path. This is the iOS counterpart of the Android host's `.action.ASSISTANT` and of
/// HarmonyOS's Intents Kit.
///
/// App Intents needs iOS 16; the shell still deploys to 15, so everything here is gated
/// and simply does not exist on an iOS 15 device. Raise `IPHONEOS_DEPLOYMENT_TARGET` if
/// those devices stop mattering and the annotations can go.
///
/// Note for expectations: this makes the app's actions available to Siri and Shortcuts.
/// Third-party assistants (ChatGPT, Claude) cannot invoke another app's intents on iOS —
/// their route is a user-built shortcut that chains to these.
@available(iOS 16.0, *)
enum DocumentFormatAppEnum: String, AppEnum {
	case docx
	case pptx
	case xlsx
	case vsdx
	case markdown

	static var typeDisplayRepresentation: TypeDisplayRepresentation {
		TypeDisplayRepresentation(name: "文档格式")
	}

	static var caseDisplayRepresentations: [DocumentFormatAppEnum: DisplayRepresentation] {
		[
			.docx: DisplayRepresentation(title: "Word 文档"),
			.pptx: DisplayRepresentation(title: "演示文稿"),
			.xlsx: DisplayRepresentation(title: "电子表格"),
			.vsdx: DisplayRepresentation(title: "流程图"),
			.markdown: DisplayRepresentation(title: "Markdown"),
		]
	}
}

@available(iOS 16.0, *)
enum DocumentModeAppEnum: String, AppEnum {
	case reading
	case editing

	static var typeDisplayRepresentation: TypeDisplayRepresentation {
		TypeDisplayRepresentation(name: "文档模式")
	}

	static var caseDisplayRepresentations: [DocumentModeAppEnum: DisplayRepresentation] {
		[
			.reading: DisplayRepresentation(title: "阅读"),
			.editing: DisplayRepresentation(title: "编辑"),
		]
	}
}

@available(iOS 16.0, *)
struct NewDocumentIntent: AppIntent {
	static var title: LocalizedStringResource = "新建文档"
	static var description = IntentDescription("新建一份指定格式的空白文档并打开。")
	static var openAppWhenRun = true

	@Parameter(title: "格式")
	var format: DocumentFormatAppEnum

	init() {}

	init(format: DocumentFormatAppEnum) {
		self.format = format
	}

	static var parameterSummary: some ParameterSummary {
		Summary("新建 \(\.$format)")
	}

	@MainActor
	func perform() async throws -> some IntentResult {
		AssistantCommandCenter.dispatch(
			AssistantCommand(command: "new-document", format: format.rawValue, mode: nil))
		return .result()
	}
}

@available(iOS 16.0, *)
struct OpenDocumentIntent: AppIntent {
	static var title: LocalizedStringResource = "打开文件"
	static var description = IntentDescription("打开系统文件选择器，挑一份文档来编辑。")
	static var openAppWhenRun = true

	init() {}

	@MainActor
	func perform() async throws -> some IntentResult {
		AssistantCommandCenter.dispatch(
			AssistantCommand(command: "open-document-picker", format: nil, mode: nil))
		return .result()
	}
}

@available(iOS 16.0, *)
struct ShowRecentDocumentsIntent: AppIntent {
	static var title: LocalizedStringResource = "最近文档"
	static var description = IntentDescription("回到工作区，查看最近使用的文档与草稿。")
	static var openAppWhenRun = true

	init() {}

	@MainActor
	func perform() async throws -> some IntentResult {
		AssistantCommandCenter.dispatch(
			AssistantCommand(command: "recent", format: nil, mode: nil))
		return .result()
	}
}

@available(iOS 16.0, *)
struct SetDocumentModeIntent: AppIntent {
	static var title: LocalizedStringResource = "切换阅读或编辑"
	static var description = IntentDescription("把当前文档切换到阅读或编辑模式。")
	static var openAppWhenRun = true

	@Parameter(title: "模式")
	var mode: DocumentModeAppEnum

	init() {}

	init(mode: DocumentModeAppEnum) {
		self.mode = mode
	}

	static var parameterSummary: some ParameterSummary {
		Summary("切换到 \(\.$mode) 模式")
	}

	@MainActor
	func perform() async throws -> some IntentResult {
		AssistantCommandCenter.dispatch(
			AssistantCommand(command: "set-mode", format: nil, mode: mode.rawValue))
		return .result()
	}
}

/// The phrases Siri accepts and the actions Spotlight offers without the user building a
/// shortcut first. Every phrase has to contain the app name, and the system caps a
/// provider at ten.
@available(iOS 16.0, *)
struct CubeOfficeAppShortcuts: AppShortcutsProvider {
	static var appShortcuts: [AppShortcut] {
		AppShortcut(
			intent: OpenDocumentIntent(),
			phrases: [
				"用 \(.applicationName) 打开文件",
				"在 \(.applicationName) 中打开文档",
				"Open a document in \(.applicationName)",
			],
			shortTitle: "打开文件",
			systemImageName: "folder")

		AppShortcut(
			intent: NewDocumentIntent(format: .docx),
			phrases: [
				"用 \(.applicationName) 新建文档",
				"New document in \(.applicationName)",
			],
			shortTitle: "新建文档",
			systemImageName: "doc.badge.plus")

		AppShortcut(
			intent: NewDocumentIntent(format: .xlsx),
			phrases: [
				"用 \(.applicationName) 新建表格",
				"New spreadsheet in \(.applicationName)",
			],
			shortTitle: "新建表格",
			systemImageName: "tablecells")

		AppShortcut(
			intent: NewDocumentIntent(format: .pptx),
			phrases: [
				"用 \(.applicationName) 新建演示文稿",
				"New presentation in \(.applicationName)",
			],
			shortTitle: "新建演示文稿",
			systemImageName: "rectangle.on.rectangle")

		AppShortcut(
			intent: ShowRecentDocumentsIntent(),
			phrases: [
				"查看 \(.applicationName) 最近文档",
				"Recent documents in \(.applicationName)",
			],
			shortTitle: "最近文档",
			systemImageName: "clock")
	}
}
