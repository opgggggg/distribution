import Foundation
import UIKit
import WebKit

/// The native half of `window.cubeofficeServices` (see `App/Resources/bridge.js`): the
/// anonymous installation identity the shared settings panel shows, the usage-statistics
/// ping, and feedback submission. Android's `CubeOfficeServices` and HarmonyOS's
/// `HarmonyClientServices` are the same shape.
///
/// Two things differ here. WKWebView has no synchronous native call, so the identity is
/// injected into the page at document start and `getInfo()` is answered in JavaScript,
/// the way the document bridge already answers its synchronous contract; a result comes
/// back through `__auroraIosHost.settleServiceRequest`. And the App
/// Store offers no in-app update check, so `updates` reports the check for statistics and
/// tells the panel to send the user to the App Store rather than offering a download.
///
/// Fixed endpoints only: no URL ever comes from the renderer, and nothing here reports a
/// hardware identifier or document content.
final class ClientServices: NSObject {
	static let messageHandlerName = "auroraServices"

	private static let apiRoot = "https://cubexp.com/api/v1/"
	private static let automaticKey = "cubeoffice-services.automatic"
	private static let lastCheckKey = "cubeoffice-services.lastCheck"
	private static let maxResponseBytes = 65536

	weak var webView: WKWebView?

	private let clientId = ClientServices.persistentClientId()
	private let defaults = UserDefaults.standard

	// MARK: - Identity

	/// Excluded from backup, mirroring Android's no-backup directory: a restored or
	/// migrated installation gets a fresh identity instead of a duplicate of the old one.
	private static func persistentClientId() -> String {
		let manager = FileManager.default
		guard
			let directory = try? manager.url(
				for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil,
				create: true)
		else { return UUID().uuidString }
		var file = directory.appendingPathComponent("cubeoffice-client-id")
		if let stored = try? String(contentsOf: file, encoding: .utf8) {
			let trimmed = stored.trimmingCharacters(in: .whitespacesAndNewlines)
			if trimmed.range(of: "^[A-Za-z0-9_-]{20,80}$", options: .regularExpression) != nil {
				return trimmed
			}
		}
		let identifier = UUID().uuidString
		try? identifier.write(to: file, atomically: true, encoding: .utf8)
		var values = URLResourceValues()
		values.isExcludedFromBackup = true
		try? file.setResourceValues(values)
		return identifier
	}

	/// iPhone and iPad are separate client types in the statistics. Mac is not one of
	/// them: `project.yml` turns off Catalyst and "Designed for iPad".
	private static var platform: String {
		switch UIDevice.current.userInterfaceIdiom {
		case .phone: return "ios-iphone"
		case .pad: return "ios-ipad"
		default: return "ios"
		}
	}

	private static var architecture: String {
		#if arch(arm64)
			return "arm64"
		#elseif arch(x86_64)
			return "x86_64"
		#else
			return "unknown"
		#endif
	}

	private var identity: [String: Any] {
		[
			"client_id": clientId,
			"version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString")
				as? String ?? "",
			"versionCode": Int(
				Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0,
			"platform": Self.platform,
			// Major.minor as the system reports it; the build number identifies a device
			// far more closely than it explains anything about compatibility.
			"os_version": "iOS " + UIDevice.current.systemVersion,
			"arch": Self.architecture,
			"locale": Locale.preferredLanguages.first ?? "",
			"sdk": 0,
		]
	}

	/// Injected at document start, before `bridge.js`, so the shim can answer `getInfo()`
	/// on the spot.
	var identityUserScript: WKUserScript {
		var info = identity
		info["automatic"] = defaults.bool(forKey: Self.automaticKey)
		info["lastCheck"] = defaults.double(forKey: Self.lastCheckKey)
		info["updateChannel"] = "appstore"
		let json = Self.json(from: info) ?? "null"
		return WKUserScript(
			source: "window.__auroraIosClientInfo = \(json);", injectionTime: .atDocumentStart,
			forMainFrameOnly: true)
	}

	// MARK: - Script messages

	private func handle(_ body: [String: Any]) {
		switch body["name"] as? String {
		case "setAutomatic":
			defaults.set(body["enabled"] as? Bool == true, forKey: Self.automaticKey)

		case "copyClientId":
			UIPasteboard.general.string = clientId

		case "request":
			guard let id = body["id"] as? String, let operation = body["operation"] as? String
			else { return }
			run(operation, input: body["input"] as? String ?? "", id: id)

		default:
			break
		}
	}

	private func run(_ operation: String, input: String, id: String) {
		switch operation {
		case "updates":
			// The ping is the whole check here, so a failed one is reported rather than
			// swallowed the way the stores' own update checks swallow it.
			post("update-checks", identity) { [weak self] result in
				guard let self else { return }
				switch result {
				case .success:
					self.defaults.set(
						Date().timeIntervalSince1970 * 1000, forKey: Self.lastCheckKey)
					self.settle(id, data: ["channel": "appstore", "available": false])
				case .failure(let error):
					self.settle(id, error: error)
				}
			}

		case "feedback":
			guard let form = Self.object(from: input) else {
				settle(id, error: "反馈内容无效，请修改后重试")
				return
			}
			let message = (form["message"] as? String ?? "").trimmingCharacters(
				in: .whitespacesAndNewlines)
			let contact = (form["contact"] as? String ?? "").trimmingCharacters(
				in: .whitespacesAndNewlines)
			guard message.count >= 10, message.count <= 8000, contact.count <= 200 else {
				settle(id, error: "请填写 10–8000 字的问题描述，联系方式最多 200 字")
				return
			}
			var payload = identity
			payload["category"] = form["category"] as? String ?? "other"
			payload["message"] = message
			payload["contact"] = contact
			if form["includeSystem"] as? Bool == true {
				payload["system_info"] = [
					"os": "iOS " + UIDevice.current.systemVersion,
					"device": UIDevice.current.model,
				]
			}
			post("feedback", payload) { [weak self] result in
				guard let self else { return }
				switch result {
				case .success(let data):
					guard let receipt = data["feedback_id"] as? String, !receipt.isEmpty else {
						self.settle(id, error: "服务器未返回反馈编号，请稍后确认")
						return
					}
					self.settle(id, data: data)
				case .failure(let error):
					self.settle(id, error: error)
				}
			}

		default:
			settle(id, error: "当前客户端未提供此服务")
		}
	}

	private func settle(_ id: String, data: [String: Any]? = nil, error: String? = nil) {
		let response: [String: Any] =
			data.map { ["ok": true, "data": $0] }
			?? ["ok": false, "error": error ?? "请求失败，请稍后重试"]
		let json = Self.json(from: response) ?? #"{"ok":false,"error":"请求失败，请稍后重试"}"#
		webView?.evaluateJavaScript(
			"window.__auroraIosHost.settleServiceRequest(\(DocumentBridge.jsString(id)), \(DocumentBridge.jsString(json)))"
		)
	}

	// MARK: - Transport

	private enum ServiceResult {
		case success([String: Any])
		case failure(String)
	}

	private func post(
		_ path: String, _ payload: [String: Any], completion: @escaping (ServiceResult) -> Void
	) {
		guard let url = URL(string: Self.apiRoot + path), let body = Self.json(from: payload)
		else {
			completion(.failure("请求失败，请稍后重试"))
			return
		}
		var request = URLRequest(url: url, timeoutInterval: 15)
		request.httpMethod = "POST"
		request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
		request.setValue("application/json", forHTTPHeaderField: "Accept")
		request.httpBody = Data(body.utf8)
		URLSession.shared.dataTask(with: request) { data, response, _ in
			let result = Self.decode(data, response)
			DispatchQueue.main.async { completion(result) }
		}.resume()
	}

	private static func decode(_ data: Data?, _ response: URLResponse?) -> ServiceResult {
		guard let status = (response as? HTTPURLResponse)?.statusCode else {
			return .failure("无法连接服务器，请检查网络后重试")
		}
		if status == 429 { return .failure("操作过于频繁，请稍后重试") }
		guard (200..<300).contains(status) else {
			return .failure("服务暂不可用（\(status)），请稍后重试")
		}
		guard let data, data.count <= maxResponseBytes,
			let parsed = try? JSONSerialization.jsonObject(with: data),
			let fields = parsed as? [String: Any]
		else { return .failure("服务器响应无效，请稍后重试") }
		return .success(fields)
	}

	private static func json(from value: [String: Any]) -> String? {
		guard let data = try? JSONSerialization.data(withJSONObject: value) else { return nil }
		return String(data: data, encoding: .utf8)
	}

	private static func object(from json: String) -> [String: Any]? {
		guard let parsed = try? JSONSerialization.jsonObject(with: Data(json.utf8)) else {
			return nil
		}
		return parsed as? [String: Any]
	}
}

extension ClientServices: WKScriptMessageHandler {
	func userContentController(
		_ userContentController: WKUserContentController, didReceive message: WKScriptMessage
	) {
		guard message.name == Self.messageHandlerName, let body = message.body as? [String: Any]
		else { return }
		handle(body)
	}
}
