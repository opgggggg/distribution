#if CUBE_NATIVE_NOTES
  import UIKit

  /// Keep imports within the existing document format's 6 MiB data-URL limit.
  /// Camera photos often exceed it when unconditionally converted to PNG.
  enum NativePhotoImport {
    struct Payload {
      let source: String
      let size: CGSize
    }
    static let maximumSourceBytes = 6 * 1024 * 1024

    static func encode(_ image: UIImage) throws -> Payload {
      guard image.size.width.isFinite, image.size.height.isFinite,
        image.size.width > 0, image.size.height > 0
      else { throw failure() }
      let alpha = image.cgImage?.alphaInfo
      let opaque = alpha == .none || alpha == .noneSkipFirst || alpha == .noneSkipLast
      var edge: CGFloat = 2048
      for _ in 0..<6 {
        let ratio = min(1, edge / max(image.size.width, image.size.height))
        let size = CGSize(width: max(1, floor(image.size.width * ratio)),
                          height: max(1, floor(image.size.height * ratio)))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.preferredRange = .standard
        format.opaque = opaque
        let normalized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
          image.draw(in: CGRect(origin: .zero, size: size))
        }
        func payload(_ data: Data?, mime: String) -> Payload? {
          guard let data else { return nil }
          let prefix = "data:image/\(mime);base64,"
          guard prefix.utf8.count + ((data.count + 2) / 3) * 4 <= maximumSourceBytes else { return nil }
          return Payload(source: prefix + data.base64EncodedString(), size: size)
        }
        if let value = payload(normalized.pngData(), mime: "png") { return value }
        if opaque {
          for quality in [0.9, 0.75] {
            if let value = payload(normalized.jpegData(compressionQuality: quality), mime: "jpeg") {
              return value
            }
          }
        }
        // Transparent artwork must keep its alpha channel.
        edge *= 0.75
      }
      throw failure()
    }
    private static func failure() -> NSError {
      NSError(domain: "NativePhotoImport", code: 1,
              userInfo: [NSLocalizedDescriptionKey: "无法读取这张图片，请重新选择照片。"])
    }
  }
#endif
