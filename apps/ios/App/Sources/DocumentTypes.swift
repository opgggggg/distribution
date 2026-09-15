import Foundation
import UniformTypeIdentifiers

/// The formats the picker offers, mirroring `OFFICE_MIME_TYPES` in the Android host.
///
/// Several of these have no system-declared type — OFD, Visio, JMP, draw.io — so the
/// app declares them itself in `Info.plist` (`UTImportedTypeDeclarations`), which is
/// what makes `UTType(filenameExtension:)` resolve them here and what puts the app in
/// the Files app's "Open with" list for those documents.
enum DocumentTypes {
	static let extensions: [String] = [
		"docx", "doc", "dotx",
		"pptx", "ppt", "potx",
		"xlsx", "xls", "xltx", "csv",
		"vsdx", "vsd",
		"jmp",
		"drawio",
		"ofd",
		"pdf",
		"md", "markdown",
		"txt", "xml", "json", "html", "htm", "css", "js", "mjs", "ts",
		"java", "py", "sh", "yaml", "yml",
		"png", "jpg", "jpeg", "webp", "emf", "wmf",
	]

	static let openable: [UTType] = {
		var seen = Set<String>()
		var types = extensions.compactMap { UTType(filenameExtension: $0) }
			.filter { seen.insert($0.identifier).inserted }
		// Android's list ends in application/octet-stream for the same reason: a document
		// arriving from a cloud provider often carries no recognisable type at all, and
		// the editor decides by content once it is open.
		types.append(.data)
		return types
	}()
}
