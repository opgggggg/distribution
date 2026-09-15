import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the packaged mobile Web payload to `WKWebView` over a private scheme.
///
/// `file://` is not an option. WebKit gives every `file://` document an opaque origin,
/// which makes each ES module chunk a rejected cross-origin fetch and leaves
/// `localStorage` and IndexedDB — the workspace's autosave — unavailable. A custom
/// scheme with a fixed host gives the page one real, stable origin instead. This is
/// the same move the HarmonyOS host makes by intercepting a reserved HTTPS origin in
/// ArkWeb; Android gets away with `file://` only because `setAllowFileAccessFromFileURLs`
/// has no WebKit equivalent.
final class WebAssetSchemeHandler: NSObject, WKURLSchemeHandler {
	static let scheme = "aurora-app"
	static let host = "localhost"
	static let indexURL = URL(string: "\(scheme)://\(host)/index.html")!

	private let rootDirectory: URL
	private let queue = DispatchQueue(label: "\(Bundle.main.bundleIdentifier ?? "aurora").web-assets", qos: .userInitiated)
	private let lock = NSLock()
	private var activeTasks: Set<ObjectIdentifier> = []

	init(rootDirectory: URL) {
		self.rootDirectory = rootDirectory.standardizedFileURL
		super.init()
	}

	func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
		let key = ObjectIdentifier(urlSchemeTask)
		lock.lock()
		activeTasks.insert(key)
		lock.unlock()

		let request = urlSchemeTask.request
		queue.async { [weak self] in
			guard let self else { return }
			let response = self.respond(to: request)
			DispatchQueue.main.async {
				// The task is dead the moment WebKit calls stop(); touching it afterwards
				// traps, so the claim has to happen on the same queue as the stop callback.
				guard self.claim(key) else { return }
				switch response {
				case let .success(httpResponse, data):
					urlSchemeTask.didReceive(httpResponse)
					urlSchemeTask.didReceive(data)
					urlSchemeTask.didFinish()
				case let .failure(error):
					urlSchemeTask.didFailWithError(error)
				}
			}
		}
	}

	func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
		_ = claim(ObjectIdentifier(urlSchemeTask))
	}

	private func claim(_ key: ObjectIdentifier) -> Bool {
		lock.lock()
		defer { lock.unlock() }
		return activeTasks.remove(key) != nil
	}

	private enum Response {
		case success(HTTPURLResponse, Data)
		case failure(Error)
	}

	private func respond(to request: URLRequest) -> Response {
		guard let url = request.url, let fileURL = resolve(url) else {
			return .failure(URLError(.badURL))
		}
		do {
			let data = try Data(contentsOf: fileURL, options: .mappedIfSafe)
			let headers = [
				"Content-Type": Self.mimeType(for: fileURL),
				"Content-Length": String(data.count),
				// The payload ships inside the app bundle and is replaced only by a new
				// build, so the page may keep it for the lifetime of the install.
				"Cache-Control": "max-age=31536000, immutable",
			]
			guard
				let response = HTTPURLResponse(
					url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)
			else {
				return .failure(URLError(.cannotParseResponse))
			}
			return .success(response, data)
		} catch {
			return .failure(error)
		}
	}

	/// Maps a request URL onto a file inside the payload, refusing anything that
	/// escapes it. A path that names no file falls back to `index.html`, so a deep
	/// link or a history entry cannot strand the shell on a 404.
	private func resolve(_ url: URL) -> URL? {
		guard url.scheme == Self.scheme, url.host == Self.host else { return nil }
		var relativePath = url.path
		if relativePath.hasPrefix("/") { relativePath.removeFirst() }
		if relativePath.isEmpty { relativePath = "index.html" }
		guard let decoded = relativePath.removingPercentEncoding else { return nil }

		let candidate = rootDirectory.appendingPathComponent(decoded).standardizedFileURL
		let rootPath = rootDirectory.path.hasSuffix("/") ? rootDirectory.path : rootDirectory.path + "/"
		guard candidate.path.hasPrefix(rootPath) else { return nil }

		var isDirectory: ObjCBool = false
		if FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDirectory),
			!isDirectory.boolValue
		{
			return candidate
		}
		let index = rootDirectory.appendingPathComponent("index.html")
		return FileManager.default.fileExists(atPath: index.path) ? index : nil
	}

	/// `UTType` answers `application/javascript` for `.js` on some releases, which WebKit
	/// refuses to execute as a module, so the types the payload actually contains are
	/// spelled out and only anything unexpected falls back to the system database.
	static func mimeType(for fileURL: URL) -> String {
		switch fileURL.pathExtension.lowercased() {
		case "html", "htm": return "text/html; charset=utf-8"
		case "js", "mjs": return "text/javascript; charset=utf-8"
		case "css": return "text/css; charset=utf-8"
		case "json", "map": return "application/json; charset=utf-8"
		case "wasm": return "application/wasm"
		case "svg": return "image/svg+xml"
		case "png": return "image/png"
		case "jpg", "jpeg": return "image/jpeg"
		case "webp": return "image/webp"
		case "gif": return "image/gif"
		case "ico": return "image/vnd.microsoft.icon"
		case "woff2": return "font/woff2"
		case "woff": return "font/woff"
		case "ttf": return "font/ttf"
		case "otf": return "font/otf"
		case "txt": return "text/plain; charset=utf-8"
		default:
			return UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType
				?? "application/octet-stream"
		}
	}
}
