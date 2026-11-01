#if CUBE_NATIVE_NOTES
  import UIKit
  import CryptoKit
  import CubeNotes

  /// Exclusively owned Rust session. Decode on the file queue, then hand ownership
  /// to the main-thread editor; never access its handle on both queues concurrently.
  final class NativeNotebookSession {
    let handle = cube_surface_new()!
    private(set) var decodeMilliseconds = 0.0
    private(set) var startedAt = CACurrentMediaTime()
    private(set) var archiveDigest: String?
    init() {}
    convenience init(data: Data) throws {
      self.init()
      startedAt = CACurrentMediaTime()
      guard !data.isEmpty else {
        throw NSError(domain: "NativeNotebook", code: 1,
          userInfo: [NSLocalizedDescriptionKey: "笔记文件为空，原文件仍保留。"])
      }
      archiveDigest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
      if !data.isEmpty {
        let code = data.withUnsafeBytes {
          cube_surface_open(handle, $0.bindMemory(to: UInt8.self).baseAddress, $0.count)
        }
        guard code == 0 else {
          let bytes = Data(bytes: cube_surface_output_ptr(handle), count: cube_surface_output_len(handle))
          let error = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any]
          throw NSError(domain: "NativeNotebook", code: 1,
            userInfo: [NSLocalizedDescriptionKey: error?["message"] as? String ?? "笔记内容或历史记录无效，原文件仍保留。"])
        }
      }
      decodeMilliseconds = (CACurrentMediaTime() - startedAt) * 1000
    }
    func previewCacheURL(viewport: [String: Double], width: UInt32, height: UInt32) -> URL? {
      guard let archiveDigest else { return nil }
      let camera = ["x", "y", "width", "height"].map { String((viewport[$0] ?? 0).bitPattern, radix: 16) }.joined(separator: "-")
      return FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("NativeNotesPreviews-v7", isDirectory: true)
        .appendingPathComponent("\(archiveDigest)-\(camera)-\(width)x\(height).png")
    }
    deinit { cube_surface_free(handle) }
  }

  /// File lifecycle for native notebooks inside the existing CubeOffice workspace.
  /// Recovery files are private drafts; the workspace retains its existing IndexedDB library.
  final class NativeNotebookHost {
    struct Result {
      let bytes: Data
      let metadata: [String: Any]
    }
    private weak var presenter: UIViewController?
    private(set) weak var editor: NativeNotesViewController?
    private let io = DispatchQueue(label: "com.cubexp.notes.files", qos: .userInitiated)
    private let directory: URL
    private var busy = false
    init(presenter: UIViewController, directory: URL? = nil) {
      self.presenter = presenter
      self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[
        0
      ]
      .appendingPathComponent("native-notebooks", isDirectory: true)
    }
    private static func digest(_ data: Data) -> String {
      SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
    private func file(_ id: String, _ ext: String) -> URL {
      directory.appendingPathComponent(Self.digest(Data(id.utf8))).appendingPathExtension(ext)
    }
    private static func failure(_ text: String) -> NSError {
      NSError(domain: "NativeNotebook", code: 1, userInfo: [NSLocalizedDescriptionKey: text])
    }
    private static func validate(_ bytes: Data) throws {
      _ = try NativeNotebookSession(data: bytes)
    }
    func open(
      temporary: URL, name: String, id: String, readonly: Bool,
      completion: @escaping (Swift.Result<Result, Error>) -> Void
    ) {
      guard !busy, let presenter, presenter.presentedViewController == nil else {
        try? FileManager.default.removeItem(at: temporary)
        completion(.failure(Self.failure("请先关闭当前系统面板。")))
        return
      }
      busy = true
      io.async { [self] in
        defer { try? FileManager.default.removeItem(at: temporary) }
        do {
          try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
          let incoming = try Data(contentsOf: temporary, options: .mappedIfSafe)
          let url = file(id, "cubenote")
          let metaURL = file(id, "json")
          var metadata =
            ((try? Data(contentsOf: metaURL)).flatMap {
              try? JSONSerialization.jsonObject(with: $0)
            }) as? [String: Any] ?? [:]
          let recovered =
            metadata["pending"] as? Bool == true
            && metadata["baseDigest"] as? String == Self.digest(incoming)
            && FileManager.default.fileExists(atPath: url.path)
          if metadata["pending"] as? Bool == true && !recovered
            && FileManager.default.fileExists(atPath: url.path)
          {
            throw Self.failure("本机有更新的笔记草稿，请先返回文件列表恢复后再打开。")
          }
          let prepared = try NativeNotebookSession(data:
            recovered ? Data(contentsOf: url, options: .mappedIfSafe) : incoming)
          if !recovered { try incoming.write(to: url, options: .atomic) }
          metadata["id"] = id
          metadata["fileName"] = name
          metadata["baseDigest"] = Self.digest(incoming)
          if !recovered { metadata["pending"] = false }
          try JSONSerialization.data(withJSONObject: metadata).write(to: metaURL, options: .atomic)
          DispatchQueue.main.async { [self] in
            do {
              let controller = NativeNotesViewController()
              try controller.prepareEmbedded(at: url, fileName: name, readonly: readonly, loadedSession: prepared) {
                [weak self, weak controller] finalURL, changed, preview in
                guard let self else { return }
                self.io.async {
                  do {
                    let bytes = try Data(contentsOf: finalURL, options: .mappedIfSafe)
                    let result = Result(
                      bytes: bytes,
                      metadata: [
                        "id": id, "fileName": name, "changed": changed || recovered,
                        "preview": preview ?? "", "digest": Self.digest(bytes),
                      ])
                    DispatchQueue.main.async {
                      controller?.dismiss(animated: true) {
                        self.busy = false
                        self.editor = nil
                        completion(.success(result))
                      }
                    }
                  } catch {
                    DispatchQueue.main.async {
                      controller?.showHostError(error.localizedDescription)
                    }
                  }
                }
              }
              controller.draftSaved = { [weak self] changed in
                if changed { self?.markPending(id: id) }
              }
              editor = controller
              presenter.present(controller, animated: true)
            } catch {
              busy = false
              completion(.failure(error))
            }
          }
        } catch {
          DispatchQueue.main.async { [self] in
            busy = false
            completion(.failure(error))
          }
        }
      }
    }
    private func markPending(id: String) {
      io.async { [self] in
        let url = file(id, "json")
        guard let bytes = try? Data(contentsOf: url),
          var meta = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any]
        else { return }
        meta["pending"] = true
        meta["savedAt"] = Date().timeIntervalSince1970 * 1000
        try? JSONSerialization.data(withJSONObject: meta).write(to: url, options: .atomic)
      }
    }
    func flushForBackground(completion: @escaping () -> Void) {
      guard let editor else {
        completion()
        return
      }
      editor.flushNativeDraft { [self] in
        // The draft's recovery metadata is queued before this barrier on the same serial queue.
        io.async { DispatchQueue.main.async { completion() } }
      }
    }
    func acknowledge(id: String, digest: String) {
      io.async { [self] in
        guard let data = try? Data(contentsOf: file(id, "cubenote")), Self.digest(data) == digest,
          let bytes = try? Data(contentsOf: file(id, "json")),
          var meta = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any]
        else { return }
        meta["pending"] = false
        try? JSONSerialization.data(withJSONObject: meta).write(
          to: file(id, "json"), options: .atomic)
      }
    }
    func list(_ completion: @escaping ([[String: Any]]) -> Void) {
      io.async { [self] in
        let files =
          (try? FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil)) ?? []
        let items = files.filter { $0.pathExtension == "json" }.compactMap {
          url -> [String: Any]? in
          guard let bytes = try? Data(contentsOf: url),
            let meta = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any],
            meta["pending"] as? Bool == true, let id = meta["id"] as? String,
            FileManager.default.fileExists(atPath: file(id, "cubenote").path)
          else { return nil }
          return meta
        }
        DispatchQueue.main.async { completion(items) }
      }
    }
    func read(id: String, completion: @escaping (Swift.Result<Result, Error>) -> Void) {
      io.async { [self] in
        do {
          let bytes = try Data(contentsOf: file(id, "cubenote"), options: .mappedIfSafe)
          try Self.validate(bytes)
          var meta =
            (try JSONSerialization.jsonObject(with: Data(contentsOf: file(id, "json"))))
            as? [String: Any] ?? [:]
          meta["digest"] = Self.digest(bytes)
          DispatchQueue.main.async { completion(.success(Result(bytes: bytes, metadata: meta))) }
        } catch { DispatchQueue.main.async { completion(.failure(error)) } }
      }
    }
  }
#endif
