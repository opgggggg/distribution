import UIKit
import UniformTypeIdentifiers
import WebKit

/// The whole app: one `WKWebView` running the shared mobile workspace, plus the native
/// services the Web shell cannot provide — the system document picker, chunked Save As,
/// and the startup splash. The Android host's `MainActivity` is the same shape.
final class WorkspaceViewController: UIViewController {
	/// Guards against a payload that never reports ready, so the user is not left behind
	/// an overlay with no way to see WebKit's own error page.
	private static let startupSplashTimeout: TimeInterval = 20

	private(set) var webView: WKWebView!
	private let bridge = DocumentBridge()
	private let services = ClientServices()
	private var splash: StartupSplashView?
	private var splashTimeout: DispatchWorkItem?
	private var presentationLandscape = false

	override func viewDidLoad() {
		super.viewDidLoad()
		view.backgroundColor = StartupSplashView.surfaceColor
		buildWebView()
		buildSplash()
		// Anything Siri or Shortcuts raised before this point has been waiting.
		AssistantCommandCenter.register(self)
	}

	// MARK: - Web view

	private func buildWebView() {
		guard let payloadRoot = Bundle.main.url(forResource: "web", withExtension: nil) else {
			fatalError(
				"The mobile Web payload is missing. Run `npm run build:ios` (or open the project after `npm --prefix apps/ios run sync:web`)."
			)
		}

		let configuration = WKWebViewConfiguration()
		configuration.setURLSchemeHandler(
			WebAssetSchemeHandler(rootDirectory: payloadRoot), forURLScheme: WebAssetSchemeHandler.scheme)
		configuration.allowsInlineMediaPlayback = true
		configuration.mediaTypesRequiringUserActionForPlayback = []
		configuration.defaultWebpagePreferences.allowsContentJavaScript = true

		let controller = configuration.userContentController
		controller.add(bridge, name: DocumentBridge.messageHandlerName)
		controller.add(services, name: ClientServices.messageHandlerName)
		// The identity goes in first: bridge.js reads it while it builds the host object.
		controller.addUserScript(services.identityUserScript)
		if let bridgeScript = Self.loadBridgeScript() {
			controller.addUserScript(
				WKUserScript(source: bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
		}

		webView = WKWebView(frame: .zero, configuration: configuration)
		webView.navigationDelegate = self
		webView.uiDelegate = self
		webView.isOpaque = false
		webView.backgroundColor = StartupSplashView.surfaceColor
		webView.scrollView.backgroundColor = StartupSplashView.surfaceColor
		webView.scrollView.contentInsetAdjustmentBehavior = .never
		webView.scrollView.bounces = false
		webView.allowsBackForwardNavigationGestures = false
		if #available(iOS 16.4, *) {
			// Lets Safari's Web Inspector attach to a development build on a connected Mac.
			webView.isInspectable = true
		}

		bridge.webView = webView
		bridge.presenter = self
		services.webView = webView
		bridge.onReady = { [weak self] in self?.hideSplash() }
		bridge.onPresentationLandscape = { [weak self] enabled in
			self?.applyPresentationLandscape(enabled)
		}
		bridge.onDocumentPickerRequested = { [weak self] in self?.presentDocumentPicker() }

		webView.translatesAutoresizingMaskIntoConstraints = false
		view.addSubview(webView)
		// The workspace draws its own bars, so it gets the safe area as padding rather
		// than the full screen; `viewport-fit` alone would not keep the keyboard clear.
		NSLayoutConstraint.activate([
			webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
			webView.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
			webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
			webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
		])

		webView.load(URLRequest(url: WebAssetSchemeHandler.indexURL))
	}

	private static func loadBridgeScript() -> String? {
		guard let url = Bundle.main.url(forResource: "bridge", withExtension: "js") else {
			assertionFailure("bridge.js is missing from the app bundle.")
			return nil
		}
		return try? String(contentsOf: url, encoding: .utf8)
	}

	// MARK: - Startup splash

	private func buildSplash() {
		let splash = StartupSplashView(appName: Self.appDisplayName)
		splash.translatesAutoresizingMaskIntoConstraints = false
		view.addSubview(splash)
		NSLayoutConstraint.activate([
			splash.topAnchor.constraint(equalTo: view.topAnchor),
			splash.bottomAnchor.constraint(equalTo: view.bottomAnchor),
			splash.leadingAnchor.constraint(equalTo: view.leadingAnchor),
			splash.trailingAnchor.constraint(equalTo: view.trailingAnchor),
		])
		self.splash = splash

		let timeout = DispatchWorkItem { [weak self] in self?.hideSplash() }
		splashTimeout = timeout
		DispatchQueue.main.asyncAfter(deadline: .now() + Self.startupSplashTimeout, execute: timeout)
	}

	private func hideSplash() {
		splashTimeout?.cancel()
		splashTimeout = nil
		splash?.dismiss()
		splash = nil
	}

	static var appDisplayName: String {
		(Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
			?? (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String)
			?? "Office"
	}

	// MARK: - System documents

	/// Hands the app a document the system opened, an `open in` share, or a picker result.
	func open(_ url: URL) {
		let scoped = url.startAccessingSecurityScopedResource()
		defer { if scoped { url.stopAccessingSecurityScopedResource() } }

		// The URL is only readable inside this callback, and for an in-place open it
		// points at another app's container, so the bytes are copied first.
		let copy = FileManager.default.temporaryDirectory
			.appendingPathComponent("auroraprime-open-\(UUID().uuidString)", isDirectory: true)
			.appendingPathComponent(url.lastPathComponent)
		do {
			try FileManager.default.createDirectory(
				at: copy.deletingLastPathComponent(), withIntermediateDirectories: true)
			try FileManager.default.copyItem(at: url, to: copy)
		} catch {
			return
		}
		bridge.enqueueDocument(
			at: copy, fileName: url.lastPathComponent, mimeType: Self.mimeType(for: url))
	}

	func handle(_ url: URL) {
		if url.isFileURL {
			open(url)
			return
		}
		guard let scheme = Bundle.main.object(forInfoDictionaryKey: "AppURLScheme") as? String,
			let command = AssistantCommand.from(url: url, urlScheme: scheme)
		else { return }
		dispatch(command)
	}

	/// Every assistant command lands here, from the URL scheme or from an App Intent.
	func dispatch(_ command: AssistantCommand) {
		bridge.enqueue(command)
	}

	func presentDocumentPicker() {
		let picker = UIDocumentPickerViewController(
			forOpeningContentTypes: DocumentTypes.openable, asCopy: true)
		picker.allowsMultipleSelection = true
		picker.delegate = self
		picker.modalPresentationStyle = .formSheet
		present(picker, animated: true)
	}

	private static func mimeType(for url: URL) -> String {
		UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
	}

	// MARK: - Immersive presentation

	override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
		presentationLandscape ? .landscape : (UIDevice.current.userInterfaceIdiom == .pad ? .all : .allButUpsideDown)
	}

	override var prefersStatusBarHidden: Bool { presentationLandscape }
	override var prefersHomeIndicatorAutoHidden: Bool { presentationLandscape }

	private func applyPresentationLandscape(_ enabled: Bool) {
		presentationLandscape = enabled
		setNeedsStatusBarAppearanceUpdate()
		setNeedsUpdateOfHomeIndicatorAutoHidden()
		guard let scene = view.window?.windowScene else { return }
		if #available(iOS 16.0, *) {
			setNeedsUpdateOfSupportedInterfaceOrientations()
			// Ignored while an iPad app is resizable — a slide show there simply stays in
			// whichever orientation the user is holding, which is the platform behaviour.
			scene.requestGeometryUpdate(
				.iOS(interfaceOrientations: enabled ? .landscape : .all)) { _ in }
		}
	}

	// The workspace installs `window.auroraHandleBack`, but iOS dispatches no system
	// back gesture; a hardware keyboard's Escape reaches the page directly and the Web
	// shell handles it there, so the shell needs no native entry point for it.

	deinit {
		let controller = webView?.configuration.userContentController
		controller?.removeScriptMessageHandler(forName: DocumentBridge.messageHandlerName)
		controller?.removeScriptMessageHandler(forName: ClientServices.messageHandlerName)
		bridge.dispose()
	}
}

extension WorkspaceViewController: WKNavigationDelegate {
	func webView(
		_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
		decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
	) {
		guard let url = navigationAction.request.url else {
			decisionHandler(.cancel)
			return
		}
		if url.scheme == WebAssetSchemeHandler.scheme || url.scheme == "about" {
			decisionHandler(.allow)
			return
		}
		// Everything else is an outward link; it belongs to Safari, not to the shell.
		decisionHandler(.cancel)
		if UIApplication.shared.canOpenURL(url) {
			UIApplication.shared.open(url)
		}
	}

	func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
		// appReady() is the real signal; this only covers a payload that fails to mount.
		DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.hideSplash() }
	}

	func webView(
		_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error
	) {
		hideSplash()
	}

	func webView(
		_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error
	) {
		hideSplash()
	}

	func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
		// The editor holds large documents in memory; if the content process is killed
		// the only recovery is a reload, and the bridge's queues belong to the old page.
		bridge.resetForNewPage()
		webView.load(URLRequest(url: WebAssetSchemeHandler.indexURL))
	}
}

extension WorkspaceViewController: WKUIDelegate {
	func webView(
		_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
		for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures
	) -> WKWebView? {
		if let url = navigationAction.request.url, UIApplication.shared.canOpenURL(url) {
			UIApplication.shared.open(url)
		}
		return nil
	}
}

extension WorkspaceViewController: UIDocumentPickerDelegate {
	func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
		for url in urls { open(url) }
	}
}
