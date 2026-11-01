import Foundation
import CoreGraphics

/// Maps a published raster into the current Rust viewport without rerasterizing it.
enum NativeCanvasProjection {
  static func canReuse(_ image: [String: Double], for viewport: [String: Double]) -> Bool {
    guard let ix = image["x"], let iy = image["y"], let iw = image["width"], let ih = image["height"],
      let x = viewport["x"], let y = viewport["y"], let w = viewport["width"], let h = viewport["height"],
      [ix, iy, iw, ih, x, y, w, h].allSatisfy({ $0.isFinite }), w > 0, h > 0 else { return false }
    return x >= ix && y >= iy && x + w <= ix + iw && y + h <= iy + ih
      && iw / w <= 2.5 && ih / h <= 2.5
  }
  static func covering(_ viewport: [String: Double]) -> [String: Double] {
    let w = viewport["width"] ?? 1, h = viewport["height"] ?? 1
    guard w * 1.25 <= 1e7, h * 1.25 <= 1e7,
      abs((viewport["x"] ?? 0) - w * 0.125) <= 1e9,
      abs((viewport["y"] ?? 0) - h * 0.125) <= 1e9 else { return viewport }
    return ["x": (viewport["x"] ?? 0) - w * 0.125, "y": (viewport["y"] ?? 0) - h * 0.125,
      "width": w * 1.25, "height": h * 1.25]
  }
  static func transform(from image: [String: Double], to viewport: [String: Double], size: CGSize) -> CGAffineTransform {
    let sw = Double(size.width), sh = Double(size.height)
    guard let ix = image["x"], let iy = image["y"], let iw = image["width"], let ih = image["height"],
      let x = viewport["x"], let y = viewport["y"], let w = viewport["width"], let h = viewport["height"],
      [ix, iy, iw, ih, x, y, w, h, sw, sh].allSatisfy({ $0.isFinite }),
      iw > 0, ih > 0, w > 0, h > 0, size.width > 0, size.height > 0 else { return .identity }
    return CGAffineTransform(a: CGFloat(iw / w), b: 0, c: 0, d: CGFloat(ih / h),
      tx: CGFloat((ix - x) / w * sw), ty: CGFloat((iy - y) / h * sh))
  }
}
