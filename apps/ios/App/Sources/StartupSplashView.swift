import UIKit

/// Native stand-in for the first Web paint.
///
/// The payload is several megabytes of JavaScript that WebKit has to read out of the app
/// bundle and compile before Vue can mount, and until then the `WKWebView` is an empty
/// surface. Drawing the app mark in the first frame keeps the launch from reading as a
/// frozen blank screen; the Web shell removes it through `appReady()`. The Android host
/// draws the same thing for the same reason.
final class StartupSplashView: UIView {
	private static let surface = UIColor { traits in
		traits.userInterfaceStyle == .dark
			? UIColor(red: 0x17 / 255, green: 0x1B / 255, blue: 0x19 / 255, alpha: 1)
			: UIColor(red: 0xF5 / 255, green: 0xF7 / 255, blue: 0xF6 / 255, alpha: 1)
	}

	private static let secondaryText = UIColor { traits in
		traits.userInterfaceStyle == .dark
			? UIColor(red: 0xA8 / 255, green: 0xB6 / 255, blue: 0xAD / 255, alpha: 1)
			: UIColor(red: 0x5B / 255, green: 0x66 / 255, blue: 0x64 / 255, alpha: 1)
	}

	static var surfaceColor: UIColor { surface }

	init(appName: String) {
		super.init(frame: .zero)
		backgroundColor = Self.surface
		// Swallow touches so taps during startup do not reach a half-built page.
		isUserInteractionEnabled = true
		accessibilityLabel = "正在载入 \(appName)…"
		isAccessibilityElement = true

		let mark = UIImageView(image: UIImage(named: "AppMark"))
		mark.contentMode = .scaleAspectFit
		mark.layer.cornerRadius = 22
		mark.layer.cornerCurve = .continuous
		mark.clipsToBounds = true
		mark.isAccessibilityElement = false

		let spinner = UIActivityIndicatorView(style: .medium)
		spinner.color = Self.secondaryText
		spinner.startAnimating()

		let label = UILabel()
		label.text = "正在载入 \(appName)…"
		label.textColor = Self.secondaryText
		label.font = .systemFont(ofSize: 14)
		label.isAccessibilityElement = false

		let stack = UIStackView(arrangedSubviews: [mark, spinner, label])
		stack.axis = .vertical
		stack.alignment = .center
		stack.translatesAutoresizingMaskIntoConstraints = false
		stack.setCustomSpacing(32, after: mark)
		stack.setCustomSpacing(12, after: spinner)
		addSubview(stack)

		NSLayoutConstraint.activate([
			stack.centerXAnchor.constraint(equalTo: centerXAnchor),
			stack.centerYAnchor.constraint(equalTo: centerYAnchor),
			mark.widthAnchor.constraint(equalToConstant: 96),
			mark.heightAnchor.constraint(equalToConstant: 96),
		])
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) {
		fatalError("init(coder:) is not used; the shell builds its views in code.")
	}

	func dismiss() {
		UIView.animate(
			withDuration: 0.15,
			animations: { self.alpha = 0 },
			completion: { _ in self.removeFromSuperview() })
	}
}
