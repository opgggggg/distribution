import UIKit

/// Where assistant commands converge, whatever raised them: a `cubeoffice://assistant`
/// link, Siri, the Shortcuts app, or Spotlight.
///
/// App Intents can run before a workspace exists — iOS launches the app and performs the
/// intent, and the scene may not have built its view controller yet — so commands wait
/// here until one registers. `DocumentBridge` then does the same again for the Web shell,
/// which is not mounted either at that point.
@MainActor
enum AssistantCommandCenter {
	private static weak var workspace: WorkspaceViewController?
	private static var pending: [AssistantCommand] = []

	static func register(_ workspace: WorkspaceViewController) {
		Self.workspace = workspace
		let queued = pending
		pending.removeAll()
		for command in queued { workspace.dispatch(command) }
	}

	static func dispatch(_ command: AssistantCommand) {
		guard let workspace else {
			pending.append(command)
			return
		}
		workspace.dispatch(command)
	}
}
