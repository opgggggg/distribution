#if CUBE_NATIVE_NOTES
import UIKit
import QuartzCore
import Metal
import CoreText
import CubeNotes

/// Display surface only. UIKit continues to own input, chrome and accessibility.
final class NativeMetalCanvas: UIView {
  // A standalone render layer has no UIView delegate. wgpu configures device,
  // drawable size and surface state on its worker; UIKit owns only its frame.
  let metalLayer = CAMetalLayer()
  override init(frame: CGRect) {
    super.init(frame:frame)
    isUserInteractionEnabled=false
    isOpaque=true
    layer.addSublayer(metalLayer)
    metalLayer.isOpaque=true
    metalLayer.presentsWithTransaction=false
    accessibilityIdentifier="native-wgpu-canvas"
  }
  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin();CATransaction.setDisableActions(true)
    metalLayer.frame=bounds
    CATransaction.commit()
  }
  required init?(coder:NSCoder) { fatalError("init(coder:) has not been implemented") }
}

/// Owns wgpu and all its resources on one serial worker. There is never a CPU
/// board raster or GPU readback on the live display path. A detached immutable
/// Rust frame is the only scene data crossing from the main thread.
final class NativeGpuWorker {
  private let queue=DispatchQueue(label:"com.cubexp.notes.wgpu",qos:.userInteractive)
  private let layer: CAMetalLayer
  private var handle: OpaquePointer?
  private var fontsLoaded=false
  init(layer:CAMetalLayer) { self.layer=layer }
  deinit {
    let gpu=handle
    let retainedLayer=layer
    queue.async { cube_gpu_free(gpu); _=retainedLayer }
  }
  func trim() {
    queue.async { [self] in
      cube_gpu_free(handle);handle=nil;fontsLoaded=false
    }
  }
  func render(frame:OpaquePointer,width:UInt32,height:UInt32,readback:Bool=false,
    completion:@escaping (Result<(Data,[String:Any]),Error>)->Void) {
    queue.async { [self] in
      autoreleasepool {
        CATransaction.begin();CATransaction.setDisableActions(true)
        defer {CATransaction.commit()}
        defer { cube_surface_frame_free(frame) }
        let start=CACurrentMediaTime()
        if handle==nil {handle=cube_gpu_new(Unmanaged.passUnretained(layer).toOpaque())}
        func bytes()->Data {Data(bytes:cube_gpu_output_ptr(handle),count:cube_gpu_output_len(handle))}
        func fail() {
          let message=String(data:bytes(),encoding:.utf8) ?? "GPU renderer failed"
          DispatchQueue.main.async {completion(.failure(NSError(domain:"CubeOffice.GPU",code:1,userInfo:[NSLocalizedDescriptionKey:message])))}
        }
        guard cube_gpu_ready(handle) != 0 else {fail();return}
        if !fontsLoaded && cube_surface_frame_needs_fonts(frame) != 0 {
          let font=CTFontCreateWithName("ArialMT" as CFString,17,nil)
          let urls=[CTFontDescriptorCopyAttribute(CTFontCopyFontDescriptor(font),kCTFontURLAttribute) as? URL,
            Bundle.main.url(forResource:"NotoSansCJKsc-Regular",withExtension:"otf",subdirectory:"NotesFonts")]
          for url in urls.compactMap({$0}) {
            if let data=try? Data(contentsOf:url,options:.mappedIfSafe) {
              let code=data.withUnsafeBytes {cube_gpu_font(handle,$0.bindMemory(to:UInt8.self).baseAddress,$0.count)}
              guard code==0 else {fail();return}
            }
          }
          fontsLoaded=true
        }
        guard cube_gpu_draw(handle,frame,width,height,readback ? 1:0)==0 else {fail();return}
        let pixels=readback ? bytes():Data()
        guard cube_gpu_report(handle)==0 else {fail();return}
        var report=(try? JSONSerialization.jsonObject(with:bytes())) as? [String:Any] ?? [:]
        report["workerMs"]=(CACurrentMediaTime()-start)*1000
        DispatchQueue.main.async {completion(.success((pixels,report)))}
      }
    }
  }
}
#endif
