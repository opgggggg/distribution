import Foundation
import ImageIO
import UniformTypeIdentifiers
import WebKit

/// The native half of `decodeImageWithHost` in the Web shell (see `bridge.js`).
///
/// WKWebView decodes HEIC itself from iOS 17; this covers iOS 15 and 16, and any image
/// a WebView cannot read but ImageIO can. The page posts the source bytes as base64
/// chunks and gets the JPEG back in the reply, so no state outlives one message.
final class ImageDecoder: NSObject, WKScriptMessageHandlerWithReply {
	static let messageHandlerName = "auroraImage"

	// Below the 16.7 MP canvas ceiling the Web shell re-encodes into.
	private static let maxOutputPixels = 16_000_000.0
	private static let jpegQuality = 0.92

	func userContentController(
		_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
		replyHandler: @escaping (Any?, String?) -> Void
	) {
		guard let body = message.body as? [String: Any], let chunks = body["chunks"] as? [String]
		else {
			replyHandler("", nil)
			return
		}
		// ImageIO is thread-safe; a 12 MP photo takes long enough to stall the main thread.
		DispatchQueue.global(qos: .userInitiated).async {
			var source = Data()
			for chunk in chunks {
				guard let bytes = Data(base64Encoded: chunk) else {
					DispatchQueue.main.async { replyHandler("", nil) }
					return
				}
				source.append(bytes)
			}
			let encoded = Self.jpeg(from: source)?.base64EncodedString() ?? ""
			DispatchQueue.main.async { replyHandler(encoded, nil) }
		}
	}

	/// Decodes with the stored orientation applied and re-encodes as JPEG.
	static func jpeg(from data: Data) -> Data? {
		guard let source = CGImageSourceCreateWithData(data as CFData, nil),
			let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
			let width = properties[kCGImagePropertyPixelWidth] as? Double,
			let height = properties[kCGImagePropertyPixelHeight] as? Double,
			width > 0, height > 0
		else { return nil }
		let scale = min(1, (maxOutputPixels / (width * height)).squareRoot())
		let options: [CFString: Any] = [
			kCGImageSourceCreateThumbnailFromImageAlways: true,
			kCGImageSourceCreateThumbnailWithTransform: true,
			kCGImageSourceThumbnailMaxPixelSize: Int(max(width, height) * scale),
		]
		guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
		else { return nil }
		let output = NSMutableData()
		guard
			let destination = CGImageDestinationCreateWithData(
				output, UTType.jpeg.identifier as CFString, 1, nil)
		else { return nil }
		CGImageDestinationAddImage(
			destination, image,
			[kCGImageDestinationLossyCompressionQuality: jpegQuality] as CFDictionary)
		return CGImageDestinationFinalize(destination) ? output as Data : nil
	}
}
