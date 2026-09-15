import Foundation

/// A `cubeoffice://assistant/...` deep link, normalised into the `assistant-command`
/// descriptor the shared Web shell parses (`parseNativeAssistantCommand`).
///
/// The accepted spellings match `AssistantCommand` in the Android host so a shortcut,
/// a Siri intent, or a link authored for one platform keeps working on the other.
struct AssistantCommand {
	let command: String
	let format: String?
	let mode: String?

	private static let formats: Set<String> = ["docx", "pptx", "xlsx", "vsdx", "markdown"]

	static func from(url: URL, urlScheme: String) -> AssistantCommand? {
		guard url.scheme?.lowercased() == urlScheme.lowercased(),
			url.host?.lowercased() == "assistant"
		else { return nil }

		let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
		let query = components?.queryItems ?? []
		let segment = url.pathComponents.first(where: { $0 != "/" }) ?? "home"
		return normalize(
			command: segment,
			format: query.first(where: { $0.name == "format" })?.value,
			mode: query.first(where: { $0.name == "mode" })?.value)
	}

	private static func normalize(command: String?, format: String?, mode: String?) -> AssistantCommand? {
		var command = command?.lowercased() ?? ""
		var format = normalizeFormat(format)
		var mode = mode?.lowercased()

		if command.hasPrefix("new-") {
			format = normalizeFormat(String(command.dropFirst(4)))
			command = "new"
		}
		if command == "open" {
			return AssistantCommand(command: "open-document-picker", format: nil, mode: nil)
		}
		if command == "new", let format {
			return AssistantCommand(command: "new-document", format: format, mode: nil)
		}
		switch command {
		case "read", "reading":
			command = "set-mode"
			mode = "reading"
		case "edit", "editing":
			command = "set-mode"
			mode = "editing"
		case "mode":
			command = "set-mode"
		default:
			break
		}
		if command == "set-mode" {
			guard mode == "reading" || mode == "editing" else { return nil }
			return AssistantCommand(command: command, format: nil, mode: mode)
		}
		if ["home", "activity", "recent", "open-recent"].contains(command) {
			return AssistantCommand(command: command, format: nil, mode: nil)
		}
		return nil
	}

	private static func normalizeFormat(_ format: String?) -> String? {
		guard let format = format?.lowercased(), !format.isEmpty else { return nil }
		let canonical: String
		switch format {
		case "word", "doc": canonical = "docx"
		case "powerpoint", "ppt", "slides", "presentation": canonical = "pptx"
		case "excel", "xls", "sheet", "spreadsheet": canonical = "xlsx"
		case "visio", "vsd", "diagram": canonical = "vsdx"
		case "md", "markdown": canonical = "markdown"
		default: canonical = format
		}
		return formats.contains(canonical) ? canonical : nil
	}

	var descriptorJSON: String? {
		var descriptor: [String: String] = [
			"type": "assistant-command",
			"command": command,
			"source": "ios",
			"requestId": UUID().uuidString,
		]
		descriptor["format"] = format
		descriptor["mode"] = mode
		guard let data = try? JSONSerialization.data(withJSONObject: descriptor) else { return nil }
		return String(data: data, encoding: .utf8)
	}
}
