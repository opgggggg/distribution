import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
	var window: UIWindow?

	private var workspace: WorkspaceViewController? {
		window?.rootViewController as? WorkspaceViewController
	}

	func scene(
		_ scene: UIScene, willConnectTo session: UISceneSession,
		options connectionOptions: UIScene.ConnectionOptions
	) {
		guard let windowScene = scene as? UIWindowScene else { return }
		let window = UIWindow(windowScene: windowScene)
		window.rootViewController = WorkspaceViewController()
		window.makeKeyAndVisible()
		self.window = window

		// A cold launch carries its document here rather than through openURLContexts.
		// The bridge queues it until the Web shell reports ready.
		for context in connectionOptions.urlContexts {
			workspace?.handle(context.url)
		}
	}

	func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
		for context in URLContexts {
			workspace?.handle(context.url)
		}
	}
}
