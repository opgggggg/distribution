import Foundation
import UIKit
import CryptoKit

/// File-provider coordination and final picker/share receipts, independent of editor state.
final class FileOperations: NSObject, UIDocumentPickerDelegate {
    private struct Export { let id: String; let url: URL }
    private var exports: [ObjectIdentifier: Export] = [:]
    private let settle: (String, String) -> Void
    private let io = DispatchQueue(label: "com.cubexp.file-operations")
    private let referenceDirectory: URL

    init(settle: @escaping (String, String) -> Void) {
        self.settle = settle
        referenceDirectory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("document-sources", isDirectory: true)
        super.init()
        try? FileManager.default.createDirectory(at: referenceDirectory, withIntermediateDirectories: true)
    }

    func reference(at url: URL) -> [String: Any]? {
        do {
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            let bookmark = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
            let id = UUID().uuidString
            try bookmark.write(to: referenceDirectory.appendingPathComponent(id), options: .atomic)
            return ["id": id, "name": url.lastPathComponent,
                    "location": "iOS 文件", "writable": FileManager.default.isWritableFile(atPath: url.path), "version": Self.digest(data)]
        } catch { return nil }
    }

    func finish(id: String, name: String, temporary: URL, intent: String,
                source: [String: Any]?, presenter: UIViewController?) {
        if intent == "save" {
            io.async { [self] in
                do {
                    guard let source, let sourceId = source["id"] as? String,
                          UUID(uuidString: sourceId) != nil, source["writable"] as? Bool == true else {
                        throw Self.failure("原文件不可写，请另存副本。")
                    }
                    let bookmark = try Data(contentsOf: referenceDirectory.appendingPathComponent(sourceId))
                    var stale = false
                    let url = try URL(resolvingBookmarkData: bookmark, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    let bytes = try Data(contentsOf: temporary, options: .mappedIfSafe)
                    var coordinationError: NSError?
                    var writeError: Error?
                    NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coordinationError) { target in
                        do {
                            let current = try Data(contentsOf: target, options: .mappedIfSafe)
                            guard Self.digest(current) == source["version"] as? String else {
                                throw Self.failure("原文件已被其他应用修改，请重新打开或另存副本。")
                            }
                            try bytes.write(to: target, options: .atomic)
                        } catch { writeError = error }
                    }
                    if let error = coordinationError ?? (writeError as NSError?) { throw error }
                    var updated = source
                    updated["version"] = Self.digest(bytes)
                    receipt(id, ["status": "saved", "destination": url.lastPathComponent, "source": updated])
                } catch { receipt(id, ["error": error.localizedDescription]) }
                try? FileManager.default.removeItem(at: temporary)
            }
            return
        }
        guard let presenter, presenter.presentedViewController == nil else {
            receipt(id, ["error": "另一个系统面板尚未关闭，请重试。"])
            try? FileManager.default.removeItem(at: temporary)
            return
        }
        do {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
                .appendingPathComponent(name)
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.moveItem(at: temporary, to: url)
            switch intent {
            case "export":
                let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
                exports[ObjectIdentifier(picker)] = Export(id: id, url: url)
                picker.delegate = self
                presenter.present(picker, animated: true)
            case "share":
                let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                share.popoverPresentationController?.sourceView = presenter.view
                share.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 1, width: 1, height: 1)
                share.completionWithItemsHandler = { [self] _, completed, _, error in
                    receipt(id, error.map { ["error": $0.localizedDescription] }
                        ?? ["status": completed ? "shared" : "cancelled"])
                    cleanup(url)
                }
                presenter.present(share, animated: true)
            case "print":
                let printController = UIPrintInteractionController.shared
                printController.printingItem = url
                let info = UIPrintInfo(dictionary: nil); info.jobName = name; info.outputType = .general
                printController.printInfo = info
                printController.present(animated: true) { [self] _, completed, error in
                    receipt(id, error.map { ["error": $0.localizedDescription] }
                        ?? ["status": completed ? "printed" : "cancelled"])
                    cleanup(url)
                }
            default:
                cleanup(url); throw Self.failure("未知文件操作。")
            }
        } catch { receipt(id, ["error": error.localizedDescription]); try? FileManager.default.removeItem(at: temporary) }
    }

    func shareMany(id: String, items: [(String, URL)], presenter: UIViewController?) {
        guard let presenter, presenter.presentedViewController == nil else {
            receipt(id, ["error": "另一个系统面板尚未关闭，请重试。"])
            for item in items { try? FileManager.default.removeItem(at: item.1) }
            return
        }
        var urls: [URL] = []
        do {
            for item in items {
                let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
                    .appendingPathComponent(item.0)
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try FileManager.default.moveItem(at: item.1, to: url); urls.append(url)
            }
            let share = UIActivityViewController(activityItems: urls, applicationActivities: nil)
            share.popoverPresentationController?.sourceView = presenter.view
            share.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 1, width: 1, height: 1)
            let output = urls
            share.completionWithItemsHandler = { [self] _, completed, _, error in
                receipt(id, error.map { ["error": $0.localizedDescription] } ?? ["status": completed ? "shared" : "cancelled"])
                for url in output { cleanup(url) }
            }
            presenter.present(share, animated: true)
        } catch {
            for item in items { try? FileManager.default.removeItem(at: item.1) }
            for url in urls { cleanup(url) }
            receipt(id, ["error": error.localizedDescription])
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let operation = exports.removeValue(forKey: ObjectIdentifier(controller)) else { return }
        let url = urls.first
        var result: [String: Any] = ["status": url == nil ? "cancelled" : "saved"]
        if let url {
            result["destination"] = url.lastPathComponent
            let scoped = url.startAccessingSecurityScopedResource()
            result["source"] = reference(at: url)
            if scoped { url.stopAccessingSecurityScopedResource() }
        }
        receipt(operation.id, result); cleanup(operation.url)
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let operation = exports.removeValue(forKey: ObjectIdentifier(controller)) else { return }
        receipt(operation.id, ["status": "cancelled"]); cleanup(operation.url)
    }
    private func receipt(_ id: String, _ result: [String: Any]) {
        guard let bytes = try? JSONSerialization.data(withJSONObject: result), let json = String(data: bytes, encoding: .utf8) else { return }
        DispatchQueue.main.async { [self] in settle(id, json) }
    }
    private func cleanup(_ url: URL) { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
    private static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    private static func failure(_ message: String) -> NSError { NSError(domain: "CubeOfficeFile", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
