import XCTest
import UIKit
@testable import AuroraPrimeOffice

enum NativePhotoFixtures {
  static func noisyPhoto(edge: Int = 2048) throws -> UIImage {
    var bytes = [UInt8](repeating: 255, count: edge * edge * 4)
    var seed: UInt32 = 1729
    for i in stride(from: 0, to: bytes.count, by: 4) {
      for c in 0..<3 {
        seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5
        bytes[i + c] = UInt8(truncatingIfNeeded: seed)
      }
    }
    let provider = try XCTUnwrap(CGDataProvider(data: Data(bytes) as CFData))
    let image = try XCTUnwrap(CGImage(width: edge, height: edge, bitsPerComponent: 8,
      bitsPerPixel: 32, bytesPerRow: edge * 4, space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
      provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent))
    return UIImage(cgImage: image)
  }
}

final class NativePhotoImportTests: XCTestCase {
  func testLargeOpaquePhotoFitsExistingDocumentLimitWithoutLosingResolution() throws {
    let image = try NativePhotoFixtures.noisyPhoto()
    let oldPNG = try XCTUnwrap(image.pngData())
    XCTAssertGreaterThan(oldPNG.base64EncodedString().utf8.count, NativePhotoImport.maximumSourceBytes,
      "Fixture must reproduce the previous import rejection")
    let payload = try NativePhotoImport.encode(image)
    XCTAssertLessThanOrEqual(payload.source.utf8.count, NativePhotoImport.maximumSourceBytes)
    XCTAssertTrue(payload.source.hasPrefix("data:image/jpeg;base64,"))
    XCTAssertEqual(payload.size, CGSize(width: 2048, height: 2048))
    let data = try XCTUnwrap(Data(base64Encoded: String(payload.source.split(separator: ",")[1])))
    XCTAssertEqual(try XCTUnwrap(UIImage(data: data)).size, payload.size)
  }

  func testTransparentArtworkKeepsAlphaAndPhotoOrientationIsNormalized() throws {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let image = UIGraphicsImageRenderer(size: CGSize(width: 80, height: 40), format: format).image { _ in
      UIColor.red.setFill()
      UIRectFill(CGRect(x: 0, y: 0, width: 40, height: 40))
    }
    let rotated = UIImage(cgImage: try XCTUnwrap(image.cgImage), scale: 1, orientation: .right)
    let payload = try NativePhotoImport.encode(rotated)
    XCTAssertTrue(payload.source.hasPrefix("data:image/png;base64,"))
    XCTAssertEqual(payload.size, CGSize(width: 40, height: 80))
    let data = try XCTUnwrap(Data(base64Encoded: String(payload.source.split(separator: ",")[1])))
    let decoded = try XCTUnwrap(UIImage(data: data)?.cgImage)
    XCTAssertTrue([CGImageAlphaInfo.premultipliedLast, .premultipliedFirst, .last, .first].contains(decoded.alphaInfo))
    var pixel = [UInt8](repeating: 0, count: 4)
    let context = try XCTUnwrap(CGContext(data: &pixel, width: 1, height: 1,
      bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
    context.draw(decoded, in: CGRect(x: 0, y: 0, width: 1, height: 1))
    XCTAssertGreaterThan(pixel[3], 100)
    XCTAssertLessThan(pixel[3], 160, "Transparent half was flattened")
  }
}
