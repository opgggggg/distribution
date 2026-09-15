import Foundation
import UIKit
import WebKit

/// The native half of `window.auroraHarmonyHost` (see `App/Resources/bridge.js`).
///
/// Everything here runs on the main thread: WebKit delivers script messages there, and
/// the document picker is UIKit.
final class DocumentBridge: NSObject {
	static let messageHandlerName = "auroraHost"

	/// Matches `OPEN_CHUNK_BYTES` in the Web shell, so one staged chunk is one read.
	private static let stageChunkBytes = 192 * 1024

	weak var webView: WKWebView?
	weak var presenter: UIViewController?

	/// The Web shell mounted and is ready to be handed queued work.
	var onReady: (() -> Void)?
	var onPresentationLandscape: ((Bool) -> Void)?
	var onDocumentPickerRequested: (() -> Void)?

	private final class SaveSession {
		let id: String
		let fileName: String
		let fileURL: URL
		let handle: FileHandle
		var failed = false

		init(id: String, fileName: String, fileURL: URL, handle: FileHandle) {
			self.id = id
			self.fileName = fileName
			self.fileURL = fileURL
			self.handle = handle
		}
	}

	private struct QueuedDocument {
		let fileURL: URL
		let fileName: String
		let mimeType: String
	}

	private var saveSessions: [String: SaveSession] = [:]
	private var exportsInFlight: [URL] = []
	private var queuedDocuments: [QueuedDocument] = []
	private var queuedCommands: [String] = []
	private var webReady = false

	// MARK: - Work arriving from the system

	/// Takes ownership of a document the system handed the app. `fileURL` must already be
	/// a private copy: the security-scoped original is not readable once the opening
	/// scene callback returns.
	func enqueueDocument(at fileURL: URL, fileName: String, mimeType: String) {
		queuedDocuments.append(
			QueuedDocument(fileURL: fileURL, fileName: fileName, mimeType: mimeType))
		flushQueuedWork()
	}

	func enqueue(_ command: AssistantCommand) {
		if command.command == "open-document-picker" {
			onDocumentPickerRequested?()
			return
		}
		guard let json = command.descriptorJSON else { return }
		queuedCommands.append(json)
		flushQueuedWork()
	}

	/// A reloaded page has an empty bridge queue; anything not yet handed over is still
	/// owned here and gets staged again once the new document reports ready.
	func resetForNewPage() {
		webReady = false
	}

	private func flushQueuedWork() {
		guard webReady, webView != nil else { return }
		while !queuedCommands.isEmpty {
			let json = queuedCommands.removeFirst()
			evaluate("window.__auroraIosHost.enqueueAssistantCommand(\(Self.jsString(json)))")
		}
		guard !queuedDocuments.isEmpty else { return }
		let document = queuedDocuments.removeFirst()
		stage(document) { [weak self] in self?.flushQueuedWork() }
	}

	/// Pushes a document into the page in chunks.
	///
	/// The Web shell reads it back synchronously through `readOpenDocumentChunk`, and
	/// WKWebView has no synchronous native call, so the bytes have to be in JavaScript
	/// before the document is announced. One `evaluateJavaScript` per chunk keeps the
	/// main thread responsive; a single multi-megabyte string would not.
	private func stage(_ document: QueuedDocument, completion: @escaping () -> Void) {
		guard let data = try? Data(contentsOf: document.fileURL, options: .mappedIfSafe) else {
			try? FileManager.default.removeItem(at: document.fileURL)
			completion()
			return
		}
		let id = UUID().uuidString
		evaluate("window.__auroraIosHost.beginStagedDocument(\(Self.jsString(id)), \(data.count))")
		stageChunk(id: id, data: data, from: 0, of: document, completion: completion)
	}

	private func stageChunk(
		id: String, data: Data, from offset: Int, of document: QueuedDocument,
		completion: @escaping () -> Void
	) {
		guard offset < data.count else {
			try? FileManager.default.removeItem(at: document.fileURL)
			evaluate(
				"window.__auroraIosHost.commitStagedDocument(\(Self.jsString(id)), \(Self.jsString(document.fileName)), \(Self.jsString(document.mimeType)))"
			)
			completion()
			return
		}
		let end = min(data.count, offset + Self.stageChunkBytes)
		// Base64 uses no character that needs escaping inside a JavaScript string literal.
		let encoded = data[offset..<end].base64EncodedString()
		evaluate("window.__auroraIosHost.stageDocumentChunk(\(Self.jsString(id)), \"\(encoded)\")") {
			[weak self] in
			self?.stageChunk(id: id, data: data, from: end, of: document, completion: completion)
		}
	}

	// MARK: - Script messages

	private func handle(_ name: String, _ body: [String: Any]) {
		switch name {
		case "appReady":
			webReady = true
			onReady?()
			flushQueuedWork()

		case "setPresentationLandscape":
			onPresentationLandscape?(body["enabled"] as? Bool ?? false)

		case "beginSave":
			guard let sessionId = body["sessionId"] as? String else { return }
			beginSave(sessionId: sessionId, fileName: body["fileName"] as? String ?? "")

		case "appendSaveChunk":
			guard let sessionId = body["sessionId"] as? String,
				let session = saveSessions[sessionId]
			else { return }
			guard !session.failed,
				let encoded = body["chunk"] as? String,
				let bytes = Data(base64Encoded: encoded)
			else {
				session.failed = true
				return
			}
			do {
				try session.handle.write(contentsOf: bytes)
			} catch {
				// `appendSaveChunk` already told JavaScript the chunk was accepted, so the
				// failure has to wait for finishSave, which the caller awaits.
				session.failed = true
			}

		case "finishSave":
			guard let sessionId = body["sessionId"] as? String else { return }
			finishSave(sessionId: sessionId)

		case "abortSave":
			guard let sessionId = body["sessionId"] as? String else { return }
			discard(saveSessions.removeValue(forKey: sessionId))

		case "finishOpenDocument":
			break  // The staged copy was deleted as soon as it reached the page.

		default:
			break
		}
	}

	// MARK: - Save As

	private func beginSave(sessionId: String, fileName: String) {
		let safeName = Self.safeFileName(fileName)
		let fileURL = FileManager.default.temporaryDirectory
			.appendingPathComponent("auroraprime-export-\(sessionId)")
		FileManager.default.createFile(atPath: fileURL.path, contents: nil)
		guard let handle = try? FileHandle(forWritingTo: fileURL) else { return }
		saveSessions[sessionId] = SaveSession(
			id: sessionId, fileName: safeName, fileURL: fileURL, handle: handle)
	}

	private func finishSave(sessionId: String) {
		guard let session = saveSessions.removeValue(forKey: sessionId) else {
			settleSave(sessionId, ok: false, message: "未知的保存会话。")
			return
		}
		try? session.handle.close()
		guard !session.failed else {
			discard(session)
			settleSave(sessionId, ok: false, message: "文档保存失败")
			return
		}

		// The export destination is named in the picker, which the Web shell does not
		// wait for — the Android host settles at the same point, when the picker opens.
		let destination = FileManager.default.temporaryDirectory
			.appendingPathComponent(UUID().uuidString, isDirectory: true)
			.appendingPathComponent(session.fileName)
		do {
			try FileManager.default.createDirectory(
				at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
			try FileManager.default.moveItem(at: session.fileURL, to: destination)
		} catch {
			discard(session)
			settleSave(sessionId, ok: false, message: "文档保存失败")
			return
		}

		guard let presenter else {
			try? FileManager.default.removeItem(at: destination.deletingLastPathComponent())
			settleSave(sessionId, ok: false, message: "没有可用的保存位置选择器")
			return
		}
		exportsInFlight.append(destination)
		let picker = UIDocumentPickerViewController(forExporting: [destination], asCopy: true)
		picker.delegate = self
		picker.modalPresentationStyle = .formSheet
		presenter.present(picker, animated: true)
		settleSave(sessionId, ok: true, message: nil)
	}

	private func settleSave(_ sessionId: String, ok: Bool, message: String?) {
		evaluate(
			"window.__auroraIosHost.settleSave(\(Self.jsString(sessionId)), \(ok), \(Self.jsString(message ?? "")))"
		)
	}

	private func discard(_ session: SaveSession?) {
		guard let session else { return }
		try? session.handle.close()
		try? FileManager.default.removeItem(at: session.fileURL)
	}

	func dispose() {
		for session in saveSessions.values { discard(session) }
		saveSessions.removeAll()
		for export in exportsInFlight {
			try? FileManager.default.removeItem(at: export.deletingLastPathComponent())
		}
		exportsInFlight.removeAll()
		for document in queuedDocuments {
			try? FileManager.default.removeItem(at: document.fileURL)
		}
		queuedDocuments.removeAll()
		queuedCommands.removeAll()
	}

	// MARK: - Helpers

	private func evaluate(_ script: String, completion: (() -> Void)? = nil) {
		guard let webView else {
			completion?()
			return
		}
		webView.evaluateJavaScript(script) { _, _ in completion?() }
	}

	/// Renders a Swift string as a JavaScript string literal.
	private static func jsString(_ value: String) -> String {
		guard let data = try? JSONSerialization.data(withJSONObject: [value]),
			let json = String(data: data, encoding: .utf8), json.count >= 2
		else { return "\"\"" }
		return String(json.dropFirst().dropLast())
	}

	static func safeFileName(_ fileName: String) -> String {
		let trimmed = fileName.replacingOccurrences(of: "/", with: "_")
			.replacingOccurrences(of: ":", with: "_")
			.trimmingCharacters(in: .whitespacesAndNewlines)
		return trimmed.isEmpty ? "document" : trimmed
	}
}

extension DocumentBridge: WKScriptMessageHandler {
	func userContentController(
		_ userContentController: WKUserContentController, didReceive message: WKScriptMessage
	) {
		guard message.name == Self.messageHandlerName,
			let body = message.body as? [String: Any],
			let name = body["name"] as? String
		else { return }
		handle(name, body)
	}
}

extension DocumentBridge: UIDocumentPickerDelegate {
	func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
		cleanUpExports()
	}

	func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
		cleanUpExports()
	}

	private func cleanUpExports() {
		for export in exportsInFlight {
			try? FileManager.default.removeItem(at: export.deletingLastPathComponent())
		}
		exportsInFlight.removeAll()
	}
}
