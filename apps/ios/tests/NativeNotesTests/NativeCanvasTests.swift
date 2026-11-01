import XCTest
import UIKit
import CubeNotes
@testable import AuroraPrimeOffice

/// Hosted UIKit integration tests: exercise the shipped view/controller and Rust ABI.
/// They deliberately use temporary documents, never the user's library.
@MainActor final class NativeCanvasTests: XCTestCase {
  private var window: UIWindow!
  private var controller: NativeNotesViewController!
  private var canvas: NativeInkView!
  private var temporary: URL!

  override func setUpWithError() throws {
    // Keep only the hosted-test process awake while we profile/refine on device.
    // Delivery replaces this host with the normal app, whose idle policy is unchanged.
    UIApplication.shared.isIdleTimerDisabled = true
    temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
    let file = temporary.appendingPathComponent("Regression.cubenote")
    try Data().write(to: file)
    controller = NativeNotesViewController(cpuReference: true)
    try controller.prepareEmbedded(at: file, fileName: file.lastPathComponent, readonly: true) { _, _, _ in }
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    window = UIWindow(windowScene: scene)
    window.rootViewController = controller
    window.makeKeyAndVisible()
    window.layoutIfNeeded()
    canvas = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? NativeInkView }.first)
    XCTAssertTrue(until { self.canvas.image != nil }, "Initial raster never published")
  }

  override func tearDownWithError() throws {
    var flushed = false
    controller.flushNativeDraft { flushed = true }
    XCTAssertTrue(until(timeout: 20) { flushed }, "Test draft was still being saved during teardown")
    window.isHidden = true
    window.rootViewController = nil
    canvas = nil
    controller = nil
    window = nil
    try FileManager.default.removeItem(at: temporary)
  }

  private func descendants(_ view: UIView) -> [UIView] {
    [view] + view.subviews.flatMap(descendants)
  }
  private func button(_ id: Int) throws -> UIButton {
    try XCTUnwrap(descendants(controller.view).compactMap { $0 as? UIButton }
      .first { $0.accessibilityIdentifier == "rust-action-\(id)" })
  }
  @discardableResult private func until(timeout: TimeInterval = 8, _ condition: () -> Bool) -> Bool {
    let end = Date().addingTimeInterval(timeout)
    while !condition() && Date() < end {
      RunLoop.main.run(until: Date().addingTimeInterval(0.01))
    }
    return condition()
  }
  private func sample(_ x: Double, _ y: Double, _ time: Double) -> InputSample {
    let point = canvas.world?(CGPoint(x: x, y: y)) ?? CGPoint(x: x, y: y)
    return InputSample(x: point.x, y: point.y, pressure: 0.5, time_ms: time)
  }
  private func beginInk() {
    canvas.input?(0, -123, true, [sample(100, 100, 0)])
    canvas.input?(1, -123, true, [sample(140, 120, 10), sample(200, 160, 20)])
  }
  private func finishInk() {
    canvas.input?(2, -123, true, [sample(230, 170, 30)])
  }

  func testSelectionShowsDeleteAndMovesObjectsBeforeLiftingThePointer() throws {
    try button(205).sendActions(for: .touchUpInside)
    beginInk(); finishInk()
    XCTAssertTrue(until { (self.canvas.presentationReport["inkLayers"] as? Int) == 0 })
    try button(12).sendActions(for: .touchUpInside)
    let point = sample(180, 147, 0)
    canvas.input?(0, -510, true, [point])
    canvas.input?(2, -510, true, [point])
    let delete = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? UIButton }
      .first { $0.accessibilityIdentifier == "native-selection-delete" })
    XCTAssertTrue(until { !delete.isHidden && delete.window != nil && !(delete.superview?.isHidden ?? true) }, "Selection had no visible delete menu")
    let toolbar = try XCTUnwrap(delete.superview as? UIStackView)
    XCTAssertEqual(toolbar.layer.cornerRadius,28,"The original rounded selection capsule was not restored")
    XCTAssertNil(delete.title(for:.normal),"The original icon-only menu acquired text labels")
    let arrange = try XCTUnwrap(descendants(toolbar).compactMap { $0 as? UIButton }.first { $0.accessibilityIdentifier == "native-selection-arrange" })
    let scene = try XCTUnwrap(descendants(toolbar).compactMap { $0 as? UIButton }.first { $0.accessibilityIdentifier == "native-selection-scene" })
    XCTAssertFalse(arrange.isHidden)
    XCTAssertFalse(scene.isHidden)
    XCTAssertGreaterThan(toolbar.frame.minY,controller.view.bounds.height*0.6,"The mobile menu should sit above the bottom pen tray")
    arrange.sendActions(for:.touchUpInside)
    let panel = try XCTUnwrap(controller.presentedViewController)
    panel.loadViewIfNeeded()
    let align = try XCTUnwrap(descendants(panel.view).compactMap { $0 as? UIButton }.first { $0.title(for:.normal) == "左对齐" })
    XCTAssertFalse(align.isEnabled,"Alignment should be unavailable for a single object")
    XCTAssertTrue(descendants(panel.view).contains { ($0 as? UISlider)?.accessibilityLabel == "笔迹粗细" })
    var dismissed = false
    panel.dismiss(animated:false) { dismissed = true }
    XCTAssertTrue(until { dismissed })
    XCTAssertTrue(until { self.controller.selectionPreparationMs > 0 }, "Selection layers were never prepared")
    print("Selection layers ready after \(controller.selectionPreparationMs) ms")
    let menuShot = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
      window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
    })
    menuShot.name = "Original selection capsule above the pen tray"
    menuShot.lifetime = .keepAlways
    add(menuShot)
    let base = canvas.image
    canvas.input?(0, -511, true, [point])
    canvas.input?(1, -511, true, [sample(260, 207, 20)])
    XCTAssertTrue(until(timeout: 0.15) { self.canvas.selectionPreviewVisible }, "Selected content did not appear while dragging")
    let patch = try XCTUnwrap(descendants(canvas).compactMap { $0 as? UIImageView }
      .first { $0.accessibilityIdentifier == "native-selection-background-patch" }?.image)
    let bg = try XCTUnwrap(patch.cgImage)
    let data = try XCTUnwrap(bg.dataProvider?.data) as Data
    let bytes = [UInt8](data)
    var dark = 0
    for offset in stride(from: 0,to: bytes.count,by: 4) {
      if bytes[offset] < 100 && bytes[offset+1] < 100 && bytes[offset+2] < 100 && bytes[offset+3] > 100 { dark += 1 }
    }
    print("Selection replacement patch dark pixels \(dark), alpha \(data[3]), size \(bg.width)x\(bg.height)")
    XCTAssertEqual(dark,0,"Replacement patch still contains the original selected ink")
    XCTAssertEqual(data[3],255,"Replacement patch is transparent and leaves the original ink visible")
    let patchShot = XCTAttachment(image: patch)
    patchShot.name = "Replacement pixels without selected object"
    patchShot.lifetime = .keepAlways
    add(patchShot)
    let first = canvas.presentationReport["selectionTransform"] as? [CGFloat] ?? []
    canvas.input?(1, -511, true, [sample(300, 237, 30)])
    XCTAssertTrue(until(timeout: 0.15) {
      let model = self.canvas.presentationReport["selectionTransform"] as? [CGFloat] ?? []
      let visible = self.canvas.presentationReport["selectionPresentation"] as? [CGFloat] ?? []
      return model.count == 6 && visible.count == 6 && abs(model[4]-first[4]) > 10 && abs(model[4]-visible[4]) < 0.1
    }, "The selected object only moved after pointer-up")
    let composite = UIGraphicsImageRenderer(bounds: canvas.bounds).image { context in
      canvas.layer.render(in: context.cgContext)
    }
    // Inspect the composed canvas, not just the replacement image: a late
    // live-ink layer used to cover that image and resurrect the original stroke.
    let composed = try XCTUnwrap(composite.cgImage)
    let composedBytes = [UInt8](try XCTUnwrap(composed.dataProvider?.data) as Data)
    let px = CGFloat(composed.width)/canvas.bounds.width
    let py = CGFloat(composed.height)/canvas.bounds.height
    var originalInkPixels = 0
    for y in Int(95*py)..<Int(175*py) {
      for x in Int(95*px)..<Int(235*px) {
        let i = y*composed.bytesPerRow+x*4
        if composedBytes[i] < 100 && composedBytes[i+1] < 100 && composedBytes[i+2] < 100 {
          originalInkPixels += 1
        }
      }
    }
    XCTAssertEqual(originalInkPixels,0,"An asynchronous ink layer left a ghost at the selection's original location")
    let compositeShot = XCTAttachment(image: composite)
    compositeShot.name = "Canvas layer composite during drag"
    compositeShot.lifetime = .keepAlways
    add(compositeShot)
    let moveShot = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
      window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
    })
    moveShot.name = "Selected content following the active pointer"
    moveShot.lifetime = .keepAlways
    add(moveShot)
    XCTAssertTrue(canvas.image === base, "Dragging rerendered the entire base instead of moving the isolated object")
    XCTAssertTrue(delete.superview?.isHidden ?? false, "The menu covered content during the drag")
    canvas.input?(2, -511, true, [sample(300, 237, 40)])
    XCTAssertTrue(until { !self.canvas.selectionPreviewVisible && self.canvas.image !== base })
    XCTAssertFalse(delete.superview?.isHidden ?? true, "The selection menu did not return after moving")
    delete.sendActions(for: .touchUpInside)
    XCTAssertTrue(until { delete.superview?.isHidden ?? true }, "Delete left an active selection")
    XCTAssertNil(controller.presentedViewController, "Deleting raised an error")
    try button(100).sendActions(for: .touchUpInside)
    try button(0).sendActions(for: .touchUpInside)
    beginInk(); finishInk()
    XCTAssertTrue(until { (self.canvas.presentationReport["inkLayers"] as? Int) == 0 })
  }

  func testLongOilStrokeKeepsPublishingWithoutGrowingFrameLatency() throws {
    try button(205).sendActions(for: .touchUpInside)
    try button(9).sendActions(for: .touchUpInside)
    func oilSample(_ i:Int) -> InputSample {
      let t=Double(i)*0.006
      let p=sample(300+220*sin(t*0.31),350+250*sin(t),Double(i)*4)
      return InputSample(x:p.x,y:p.y,pressure:0.5+0.3*sin(t*0.7),time_ms:p.time_ms)
    }
    canvas.input?(0,-902,true,[oilSample(0)])
    var early:[Double]=[],late:[Double]=[]
    var slowestInput=0.0
    for batch in 0..<512 {
      let published=controller.inkFramesPublished
      let start=CACurrentMediaTime()
      let points=(batch*16+1...batch*16+16).map(oilSample)
      canvas.input?(1,-902,true,points)
      slowestInput=max(slowestInput,(CACurrentMediaTime()-start)*1000)
      XCTAssertTrue(until(timeout:1) {self.controller.inkFramesPublished>published},"Long oil stroke stopped updating at batch \(batch)")
      if batch<64 {early.append(controller.lastInkRenderMs)}
      if batch>=448 {late.append(controller.lastInkRenderMs)}
    }
    let earlyP95=early.sorted()[Int(Double(early.count-1)*0.95)]
    let lateP95=late.sorted()[Int(Double(late.count-1)*0.95)]
    print("LONG OIL 8193 samples: early p95 \(earlyP95) ms; late p95 \(lateP95) ms; max input batch \(slowestInput) ms; max snapshot \(controller.maxInkCaptureMs) ms")
    XCTAssertLessThan(lateP95,50,"Late oil frames exceeded the live drawing budget")
    XCTAssertLessThan(lateP95,max(earlyP95*3,25),"Oil slowed down with total stroke length")
    XCTAssertLessThan(slowestInput,50,"A growing oil stroke blocked the input callback")
    XCTAssertLessThan(controller.maxInkCaptureMs,50,"A long oil snapshot blocked a display update")
    canvas.input?(2,-902,true,[oilSample(8193)])
    XCTAssertTrue(until(timeout:20) {(self.canvas.presentationReport["inkLayers"] as? Int)==0},"Final oil paint never reached the committed base")
    try button(100).sendActions(for:.touchUpInside)
    beginInk();finishInk()
    XCTAssertTrue(until(timeout:20) {(self.canvas.presentationReport["inkLayers"] as? Int)==0},"Drawing did not resume after undoing a long oil stroke")
  }

  func testEveryBrushShortLongAndTailPerformanceMatrix() throws {
    try button(205).sendActions(for:.touchUpInside)
    let names=["ballpoint","fountain","brush","pencil","watercolor","marker","crayon","reed","spray","oil","highlighter"]
    for style in 0...10 {
      try button(style).sendActions(for:.touchUpInside)
      controller.presentedViewController?.dismiss(animated:false)
      func p(_ i:Int)->InputSample {
        let t=Double(i)*0.006
        let v=sample(300+220*sin(t*0.31),350+250*sin(t),Double(i)*4)
        return InputSample(x:v.x,y:v.y,pressure:0.5+0.3*sin(t*0.7),time_ms:v.time_ms)
      }
      canvas.input?(0,-1501,true,[p(0)])
      var previous=1
      for count in [64,512,2048,8192] {
        let published=controller.inkFramesPublished
        let start=CACurrentMediaTime()
        canvas.input?(1,-1501,true,(previous..<count).map(p))
        let input=(CACurrentMediaTime()-start)*1000
        XCTAssertTrue(until(timeout:15) {self.controller.inkFramesPublished>published},"\(names[style]) stopped painting at \(count)")
        let catchup=controller.lastInkRenderMs
        let tailPublished=controller.inkFramesPublished
        canvas.input?(1,-1501,true,(count..<count+16).map(p))
        XCTAssertTrue(until(timeout:15) {self.controller.inkFramesPublished>tailPublished})
        print("DEVICE TOOL \(names[style]) n=\(count) input=\(input) catchup=\(catchup) tail16=\(controller.lastInkRenderMs) ms")
        XCTAssertLessThan(input,50,"\(names[style]) blocked input at \(count) samples")
        XCTAssertLessThan(controller.lastInkRenderMs,50,"\(names[style]) still redraws a long stroke too slowly")
        previous=count+16
      }
      canvas.input?(2,-1501,true,[p(8208)])
      XCTAssertTrue(until(timeout:30) {(self.canvas.presentationReport["inkLayers"] as? Int)==0},"\(names[style]) final commit failed")
      let before=canvas.image
      try button(100).sendActions(for:.touchUpInside)
      XCTAssertTrue(until(timeout:20) {self.canvas.image !== before},"\(names[style]) undo failed")
    }
  }

  func testBothErasersOnDenseBoardPerformanceMatrix() throws {
    let fixture=FileManager.default.urls(for:.cachesDirectory,in:.userDomainMask)[0].appendingPathComponent("NativeCanvasRegression.cubenote")
    guard FileManager.default.fileExists(atPath:fixture.path) else {throw XCTSkip("Private dense board not available")}
    let file=temporary.appendingPathComponent("EraserMatrix.cubenote")
    try FileManager.default.copyItem(at:fixture,to:file)
    try controller.prepareEmbedded(at:file,fileName:file.lastPathComponent,readonly:false) {_,_,_ in}
    XCTAssertTrue(until(timeout:20) {self.controller.openingReport["detailedRasterMs"] != nil})
    for mode in ["轨迹擦除","整笔擦除"] {
      try button(11).sendActions(for:.touchUpInside)
      if controller.presentedViewController==nil {try button(11).sendActions(for:.touchUpInside)}
      let panel=try XCTUnwrap(controller.presentedViewController)
      panel.loadViewIfNeeded()
      let choice=try XCTUnwrap(descendants(panel.view).compactMap {$0 as? UIButton}.first {$0.accessibilityLabel==mode})
      choice.sendActions(for:.touchUpInside)
      panel.dismiss(animated:false)
      XCTAssertTrue(until {self.controller.presentedViewController==nil})
      var inputTimes:[Double]=[],pixelTimes:[Double]=[]
      for batch in 0..<16 {
        let before=canvas.image
        let start=CACurrentMediaTime()
        canvas.input?(batch==0 ? 0:1,-1701,true,[sample(70+Double(batch)*22,250+Double(batch)*9,Double(batch)*8)])
        inputTimes.append((CACurrentMediaTime()-start)*1000)
        XCTAssertTrue(until(timeout:15) {self.canvas.image !== before},"\(mode) stopped publishing")
        pixelTimes.append((CACurrentMediaTime()-start)*1000)
      }
      print("DEVICE ERASER \(mode) input p95=\(inputTimes.sorted()[14]) max=\(inputTimes.max()!) pixels p95=\(pixelTimes.sorted()[14]) max=\(pixelTimes.max()!) apply max=\(controller.maxEraserApplyMs) ms")
      XCTAssertLessThan(inputTimes.sorted()[14],30,"\(mode) repeatedly blocked input")
      XCTAssertLessThan(controller.maxEraserApplyMs,50,"Coalesced eraser work blocked the display loop")
      XCTAssertLessThan(pixelTimes.sorted()[14],250,"\(mode) still waits for a large redraw")
      canvas.input?(2,-1701,true,[])
      let before=canvas.image
      try button(100).sendActions(for:.touchUpInside)
      XCTAssertTrue(until(timeout:20) {self.canvas.image !== before})
    }
  }

  func testRepeatedStrokesAcrossAutosaveAndBrushChanges() throws {
    try button(205).sendActions(for: .touchUpInside)
    for index in 0..<40 {
      if index % 4 == 0 {
        try button((index / 4) % 10).sendActions(for: .touchUpInside)
        // Tapping an already-selected brush opens settings; dismiss that panel.
        controller.presentedViewController?.dismiss(animated: false)
        try button(300 + (index / 4) % 5).sendActions(for: .touchUpInside)
      }
      let old = canvas.preview
      let pencil = TestTouch(.pencil)
      canvas.touchesBegan([pencil], with: nil)
      pencil.samplePhase = .moved
      pencil.point = CGPoint(x: 180, y: 140)
      canvas.touchesMoved([pencil], with: nil)
      XCTAssertTrue(until(timeout: 1) { self.canvas.preview !== old && self.canvas.preview.image != nil }, "Stroke \(index + 1) never became visible")
      let point = canvas.convert(CGPoint(x: 100, y: 100), to: controller.view)
      XCTAssertTrue(controller.view.hitTest(point, with: nil) === canvas, "Ink overlay blocked stroke \(index + 1)")
      if index % 8 == 4 {
        // A previous commit's autosave completes while this stroke is still down.
        RunLoop.main.run(until: Date().addingTimeInterval(1.5))
        let palm = TestTouch(.direct)
        palm.samplePhase = .cancelled
        canvas.touchesCancelled([palm], with: nil)
        pencil.point = CGPoint(x: 220, y: 180)
        canvas.touchesMoved([pencil], with: nil)
      }
      pencil.samplePhase = .ended
      canvas.touchesEnded([pencil], with: nil)
      XCTAssertNil(controller.presentedViewController, "Stroke \(index + 1) raised an input error")
    }
    XCTAssertTrue(until(timeout: 20) { (self.canvas.presentationReport["inkLayers"] as? Int) == 0 })
  }

  func testPreparedSessionFirstPaintAndExactRefinement() throws {
    let fixture = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("NativeCanvasRegression.cubenote")
    guard FileManager.default.fileExists(atPath: fixture.path) else { throw XCTSkip("Private regression archive not available") }
    let file = temporary.appendingPathComponent("Opening.cubenote")
    try FileManager.default.copyItem(at: fixture, to: file)
    let prepared = try NativeNotebookSession(data: Data(contentsOf: file))
    let start = CACurrentMediaTime()
    try controller.prepareEmbedded(at: file, fileName: file.lastPathComponent, readonly: true, loadedSession: prepared) { _, _, _ in }
    XCTAssertTrue(controller.openingReport["reusedDecodedSession"] as? Bool == true)
    XCTAssertLessThan((CACurrentMediaTime() - start) * 1000, 500, "Main-thread setup parsed the archive again")
    XCTAssertTrue(until(timeout: 8) { self.controller.openingReport["firstRasterMs"] != nil })
    print("OPENING TIMINGS \(controller.openingReport)")
    XCTAssertLessThan(controller.openingReport["firstRasterMs"] as? Double ?? .infinity, 2200)
    try button(205).sendActions(for: .touchUpInside)
    beginInk()
    XCTAssertTrue(until(timeout: 0.3) { self.canvas.preview.image != nil })
    finishInk()
    XCTAssertTrue(until(timeout: 20) { self.controller.openingReport["detailedRasterMs"] != nil })
    XCTAssertNil(controller.presentedViewController)
    // Reopen the same original archive. The temporary edited copy has a different
    // digest and must deliberately miss this original archive's preview cache.
    let reopened = temporary.appendingPathComponent("Reopened.cubenote")
    try FileManager.default.copyItem(at: fixture, to: reopened)
    let reloaded = try NativeNotebookSession(data: Data(contentsOf: reopened))
    try controller.prepareEmbedded(at: reopened, fileName: reopened.lastPathComponent, readonly: true, loadedSession: reloaded) { _, _, _ in }
    XCTAssertTrue(until(timeout: 2) { self.controller.openingReport["firstRasterMs"] != nil })
    print("REOPENING TIMINGS \(controller.openingReport)")
    XCTAssertEqual(controller.openingReport["previewCacheHit"] as? Bool, true)
    XCTAssertEqual(controller.openingReport["exactCacheReuse"] as? Bool, true)
    XCTAssertLessThan(controller.openingReport["firstRasterMs"] as? Double ?? .infinity, 800)
  }

  func testColdFileHostOpensWithoutBlockingTheMainThread() throws {
    let fixture = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("NativeCanvasRegression.cubenote")
    guard FileManager.default.fileExists(atPath: fixture.path) else { throw XCTSkip("Private regression archive not available") }
    let file = temporary.appendingPathComponent("Incoming.cubenote")
    let data = try Data(contentsOf: fixture)
    try data.write(to: file)
    // Ensure this is a cold raster measurement, rather than a cached reopen.
    let key = try NativeNotebookSession(data: data)
    if let digest = key.archiveDigest {
      let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("NativeNotesPreviews-v4")
      for entry in (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        where entry.lastPathComponent.hasPrefix(digest + "-") {
        try? FileManager.default.removeItem(at: entry)
      }
    }
    let presenter = UIViewController()
    window.rootViewController = presenter
    window.layoutIfNeeded()
    let host = NativeNotebookHost(presenter: presenter, directory: temporary.appendingPathComponent("HostDrafts"))
    var failure: Error?
    let start = CACurrentMediaTime()
    host.open(temporary: file, name: "Cold.cubenote", id: "regression-only", readonly: true) {
      if case .failure(let error) = $0 { failure = error }
    }
    XCTAssertLessThan((CACurrentMediaTime() - start) * 1000, 50, "File parsing blocked the caller")
    XCTAssertTrue(until(timeout: 8) { host.editor?.openingReport["firstRasterMs"] != nil || failure != nil })
    XCTAssertNil(failure)
    let editor = try XCTUnwrap(host.editor)
    print("COLD HOST OPEN \((CACurrentMediaTime() - start) * 1000) ms: \(editor.openingReport)")
    XCTAssertTrue(editor.openingReport["reusedDecodedSession"] as? Bool == true)
    XCTAssertLessThan((CACurrentMediaTime() - start) * 1000, 3000)
    controller = editor
    canvas = try XCTUnwrap(descendants(editor.view).compactMap { $0 as? NativeInkView }.first)
    XCTAssertTrue(until(timeout: 20) { editor.openingReport["detailedRasterMs"] != nil })
    editor.dismiss(animated: false)
  }

  func testRapidCompletedStrokesKeepTheirPendingPatches() throws {
    try button(205).sendActions(for: .touchUpInside)
    let fixture = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("NativeCanvasRegression.cubenote")
    guard FileManager.default.fileExists(atPath: fixture.path) else { throw XCTSkip("Private regression archive not available") }
    let file = temporary.appendingPathComponent("Rapid.cubenote")
    try FileManager.default.copyItem(at: fixture, to: file)
    try controller.prepareEmbedded(at: file, fileName: file.lastPathComponent, readonly: false) { _, _, _ in }
    XCTAssertTrue(until(timeout: 8) { self.controller.openingReport["firstRasterMs"] != nil })
    // Keep a ninth stroke down so a newer full base cannot hide lost previews.
    for _ in 0..<8 { beginInk(); finishInk() }
    beginInk()
    XCTAssertTrue(until(timeout: 2) { (self.canvas.presentationReport["inkLayers"] as? Int ?? 0) >= 9 },
      "A rapid stroke replaced an earlier completed stroke before its preview was drawn")
    finishInk()
  }

  func testZoomWithinPublishedPixelsDoesNotRerasterizeTheBoard() throws {
    let fixture = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("NativeCanvasRegression.cubenote")
    guard FileManager.default.fileExists(atPath: fixture.path) else { throw XCTSkip("Private regression archive not available") }
    let file = temporary.appendingPathComponent("Zoom.cubenote")
    try FileManager.default.copyItem(at: fixture, to: file)
    try controller.prepareEmbedded(at: file, fileName: file.lastPathComponent, readonly: true) { _, _, _ in }
    XCTAssertTrue(until(timeout: 20) { self.controller.openingReport["detailedRasterMs"] != nil })
    let image = canvas.image
    let count = controller.cameraRasterReuses
    let pinch = try XCTUnwrap(canvas.gestureRecognizers?.compactMap { $0 as? UIPinchGestureRecognizer }.first)
    let event = CameraEvent()
    event.phase = .began
    controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
    pinch.scale = 1.5
    event.phase = .changed
    controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
    event.phase = .ended
    let start = CACurrentMediaTime()
    controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
    XCTAssertTrue(until(timeout: 0.2) { self.controller.cameraRasterReuses > count }, "Zoom unnecessarily queued a complete board raster")
    XCTAssertTrue(canvas.image === image)
    print("CAMERA PIXEL REUSE after \((CACurrentMediaTime() - start) * 1000) ms")
  }

  func testTextDocumentLoadsFontsWhenItActuallyNeedsThem() throws {
    let kernel = try XCTUnwrap(cube_notes_new())
    defer { cube_notes_free(kernel) }
    let document: [String: Any] = ["format":"cubeoffice-notebook", "version":1, "title":"Font regression", "pages":[
      ["id":"page", "width":300, "height":400, "infinite":false, "paper":"plain", "color":"#ffffff", "bookmarked":false,
        "layers":[["id":"layer", "name":"Ink", "visible":true, "elements":[
          ["id":"text", "kind":"text", "x":30, "y":60, "size":24, "text":"CubeOffice", "color":"#111111", "font":"sans-serif"],
          ["id":"chinese", "kind":"text", "x":30, "y":140, "size":24, "text":"手写笔记", "color":"#0000ff", "font":"sans-serif"]
        ]]]]
    ]]
    let command = try JSONSerialization.data(withJSONObject: ["op":"init", "document":document])
    XCTAssertEqual(command.withUnsafeBytes { cube_notes_request(kernel, $0.bindMemory(to: UInt8.self).baseAddress, $0.count) }, 0)
    XCTAssertEqual(cube_notes_save(kernel), 0)
    let file = temporary.appendingPathComponent("Text.cubenote")
    try Data(bytes: cube_notes_output_ptr(kernel), count: cube_notes_output_len(kernel)).write(to: file)
    try controller.prepareEmbedded(at: file, fileName: file.lastPathComponent, readonly: true) { _, _, _ in }
    XCTAssertTrue(until(timeout: 20) { self.controller.openingReport["firstRasterMs"] != nil })
    XCTAssertNil(controller.presentedViewController)
    XCTAssertTrue(until(timeout: 20) { self.controller.openingReport["detailedRasterMs"] != nil })
    print("TEXT OPENING \(controller.openingReport) image \(String(describing: canvas.image?.size))")
    let attachment = XCTAttachment(image: try XCTUnwrap(canvas.image))
    attachment.lifetime = .keepAlways
    add(attachment)
    let cg = try XCTUnwrap(canvas.image?.cgImage)
    let data = try XCTUnwrap(cg.dataProvider?.data) as Data
    let pixels = data.withUnsafeBytes { bytes -> Int in
      let rgba = bytes.bindMemory(to: UInt8.self)
      return stride(from: 0, to: rgba.count - 3, by: 4).filter { rgba[$0] < 100 && rgba[$0+1] < 100 && rgba[$0+2] < 100 }.count
    }
    XCTAssertGreaterThan(pixels, 100, "The font database was skipped and text silently disappeared")
    let chinesePixels = data.withUnsafeBytes { bytes -> Int in
      let rgba = bytes.bindMemory(to: UInt8.self)
      return stride(from: 0, to: rgba.count - 3, by: 4).filter { rgba[$0] < 100 && rgba[$0+1] < 100 && rgba[$0+2] > 150 }.count
    }
    XCTAssertGreaterThan(chinesePixels, 100, "CJK fallback silently disappeared")
  }

  func testReadonlyEditColorAndInkPreview() throws {
    XCTAssertFalse(canvas.drawingEnabled)
    try button(205).sendActions(for: .touchUpInside)
    XCTAssertTrue(canvas.drawingEnabled)
    try button(0).sendActions(for: .touchUpInside)
    try button(301).sendActions(for: .touchUpInside)
    beginInk()
    XCTAssertTrue(until { self.canvas.preview.image != nil }, "Ink is invisible before lifting the Pencil")
    finishInk()
    XCTAssertTrue(until { (try? self.button(100).isEnabled) == true }, "Stroke was not committed")
    try button(100).sendActions(for: .touchUpInside)
    XCTAssertTrue(try button(101).isEnabled)
    try button(101).sendActions(for: .touchUpInside)
    XCTAssertTrue(try button(100).isEnabled)
    XCTAssertNil(controller.presentedViewController, "Drawing raised an error")
  }

  func testCameraProjectsBeforeGestureEndsAndDrawingResumes() throws {
    let pan = try XCTUnwrap(canvas.gestureRecognizers?.compactMap { $0 as? UIPanGestureRecognizer }.first)
    let pinch = try XCTUnwrap(canvas.gestureRecognizers?.compactMap { $0 as? UIPinchGestureRecognizer }.first)
    let event = CameraEvent()
    event.phase = .began
    controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
    pan.setTranslation(CGPoint(x: 120, y: 70), in: canvas)
    pinch.scale = 1.5
    event.phase = .changed
    controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
    let model = try XCTUnwrap(canvas.presentationReport["modelTransform"] as? [CGFloat])
    XCTAssertGreaterThan(model[0], 1.4)
    XCTAssertTrue(until(timeout: 0.3) {
      guard let t = self.canvas.presentationReport["presentationTransform"] as? [CGFloat], t.count == 6 else { return false }
      return abs(t[0] - model[0]) < 0.01 && abs(t[4] - model[4]) < 0.01
    }, "Presentation layer did not move while fingers remained down")
    let attachment = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
      window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
    })
    attachment.name = "Active camera gesture"
    attachment.lifetime = .keepAlways
    add(attachment)
    event.phase = .ended
    controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
    try button(205).sendActions(for: .touchUpInside)
    try button(0).sendActions(for: .touchUpInside)
    beginInk()
    XCTAssertTrue(until { self.canvas.preview.image != nil }, "Camera prevented subsequent ink publication")
    finishInk()
    XCTAssertNil(controller.presentedViewController)
  }

  func testEditingRestartsDisplayAfterBackgroundFlush() throws {
    controller.flushNativeDraft()
    try button(205).sendActions(for: .touchUpInside)
    try button(0).sendActions(for: .touchUpInside)
    beginInk()
    XCTAssertTrue(until(timeout: 0.3) { self.canvas.preview.image != nil },
      "Editing after a background flush left the display link paused")
    finishInk()
  }

  func testPalmCancellationDoesNotCancelPencilStroke() {
    let ink = NativeInkView(frame: CGRect(x: 0, y: 0, width: 300, height: 300))
    var phases: [UInt32] = []
    ink.input = { phase, _, _, _ in phases.append(phase) }
    let pencil = TestTouch(.pencil)
    let palm = TestTouch(.direct)
    ink.touchesBegan([pencil], with: nil)
    palm.samplePhase = .cancelled
    ink.touchesCancelled([palm], with: nil)
    pencil.samplePhase = .moved
    ink.touchesMoved([pencil], with: nil)
    pencil.samplePhase = .ended
    ink.touchesEnded([pencil], with: nil)
    XCTAssertEqual(phases, [0, 1, 2], "Palm rejection cancelled the active Pencil stroke")
  }

  func testNewPencilStrokeRecoversFromAnEndedTouchWithoutFinalCallback() {
    let ink = NativeInkView(frame: CGRect(x: 0, y: 0, width: 300, height: 300))
    var phases: [UInt32] = []
    ink.input = { phase, _, _, _ in phases.append(phase) }
    let first = TestTouch(.pencil)
    ink.touchesBegan([first], with: nil)
    first.samplePhase = .ended
    let second = TestTouch(.pencil)
    ink.touchesBegan([second], with: nil)
    second.samplePhase = .ended
    ink.touchesEnded([second], with: nil)
    XCTAssertEqual(phases, [0, 3, 0, 2], "A stale Pencil touch permanently rejected new strokes")
  }

  func testNewPencilSequenceCannotBeBlockedByAnOrphanedStationaryPencil() {
    let ink = NativeInkView(frame: CGRect(x: 0, y: 0, width: 300, height: 300))
    var phases: [UInt32] = []
    ink.input = { phase, _, _, _ in phases.append(phase) }
    let first = TestTouch(.pencil)
    ink.touchesBegan([first], with: nil)
    first.samplePhase = .stationary
    ink.touchesBegan([TestTouch(.direct)], with: nil)
    XCTAssertEqual(phases, [0], "Palm touch stole the Pencil")
    let second = TestTouch(.pencil)
    ink.touchesBegan([second], with: nil)
    second.samplePhase = .ended
    ink.touchesEnded([second], with: nil)
    XCTAssertEqual(phases, [0, 3, 0, 2])
  }

  func testRecycledPencilTouchCanStartANewSequence() {
    let ink = NativeInkView(frame: CGRect(x: 0, y: 0, width: 300, height: 300))
    var phases: [UInt32] = []
    ink.input = { phase, _, _, _ in phases.append(phase) }
    let pencil = TestTouch(.pencil)
    ink.touchesBegan([pencil], with: nil)
    ink.touchesBegan([pencil], with: nil)
    pencil.samplePhase = .ended
    ink.touchesEnded([pencil], with: nil)
    XCTAssertEqual(phases, [0, 3, 0, 2])
  }

  private func physicalFootprintMiB() -> Double {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let status = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    return status == KERN_SUCCESS ? Double(info.phys_footprint) / (1024*1024) : -1
  }
  func testDenseBoardDeleteLatency() throws {
    let fixture = FileManager.default.urls(for:.cachesDirectory,in:.userDomainMask)[0].appendingPathComponent("NativeCanvasRegression.cubenote")
    guard FileManager.default.fileExists(atPath:fixture.path) else { throw XCTSkip("Private dense board not available") }
    let file = temporary.appendingPathComponent("DeleteLatency.cubenote")
    try FileManager.default.copyItem(at:fixture,to:file)
    try controller.prepareEmbedded(at:file,fileName:file.lastPathComponent,readonly:false) { _,_,_ in }
    XCTAssertTrue(until(timeout:20) { self.controller.openingReport["detailedRasterMs"] != nil })
    try button(0).sendActions(for:.touchUpInside)
    controller.presentedViewController?.dismiss(animated:false)
    let beforeInk = canvas.image
    beginInk(); finishInk()
    XCTAssertTrue(until(timeout:20) { self.canvas.image !== beforeInk && (self.canvas.presentationReport["inkLayers"] as? Int) == 0 })
    try button(12).sendActions(for:.touchUpInside)
    let point = sample(180,147,0)
    canvas.input?(0,-990,true,[point]); canvas.input?(2,-990,true,[point])
    let delete = try XCTUnwrap(descendants(controller.view).compactMap { $0 as? UIButton }.first { $0.accessibilityIdentifier == "native-selection-delete" })
    XCTAssertTrue(until(timeout:20) { self.controller.selectionPreparationMs > 0 && !(delete.superview?.isHidden ?? true) })
    let before = canvas.image
    let started = CACurrentMediaTime()
    delete.sendActions(for:.touchUpInside)
    let commandMs = (CACurrentMediaTime()-started)*1000
    XCTAssertTrue(until(timeout:20) { self.canvas.image !== before })
    let pixelsMs = (CACurrentMediaTime()-started)*1000
    print("DENSE DELETE command \(commandMs) ms; base pixels \(pixelsMs) ms; refinement \(controller.lastRefinementCompleteMs) ms; cache hits \(controller.lastRefinementTileHits)")
    XCTAssertLessThan(commandMs,50,"Delete blocked input for more than three 60 Hz frames")
    XCTAssertLessThan(pixelsMs,250,"Local delete waited for a whole dense-board redraw")
    XCTAssertGreaterThan(controller.lastRefinementTileHits,0,"Delete discarded every cached tile")
    XCTAssertNil(controller.presentedViewController)
  }

  func testComplexBoardInkDuringCameraRefinement() throws {
    let fixture = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("NativeCanvasRegression.cubenote")
    guard FileManager.default.fileExists(atPath: fixture.path) else {
      throw XCTSkip("Optional private regression archive was not copied to the test device")
    }
    let file = temporary.appendingPathComponent("Complex.cubenote")
    try FileManager.default.copyItem(at: fixture, to: file)
    try controller.prepareEmbedded(at: file, fileName: file.lastPathComponent, readonly: true) { _, _, _ in }
    let old = canvas.image
    XCTAssertTrue(until(timeout: 20) { self.canvas.image !== old })
    XCTAssertTrue(until(timeout: 20) { self.controller.openingReport["detailedRasterMs"] != nil })
    print("Complex-board thermal state \(ProcessInfo.processInfo.thermalState.rawValue)")
    let refinements = controller.cameraRefinementJobs
    let pan = try XCTUnwrap(canvas.gestureRecognizers?.compactMap { $0 as? UIPanGestureRecognizer }.first)
    let pinch = try XCTUnwrap(canvas.gestureRecognizers?.compactMap { $0 as? UIPinchGestureRecognizer }.first)
    let event = CameraEvent()
    event.phase = .began
    controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
    pan.setTranslation(CGPoint(x: 30, y: 25), in: canvas)
    let initialScale = (canvas.presentationReport["modelTransform"] as? [CGFloat])?[0] ?? 1
    event.phase = .changed
    var slowestProjection = 0.0
    // Keep the gesture active: the presentation layer must follow every update,
    // rather than waiting for .ended and a CPU raster of this complex archive.
    for step in 1...12 {
      // Go beyond the exact-pixel reuse limit, so this test still starts real
      // background refinement even when opening hit the exact preview cache.
      let scale = 1 + CGFloat(step) / 5
      pinch.scale = scale
      let started = CACurrentMediaTime()
      controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
      XCTAssertTrue(until(timeout: 0.15) {
        let t = self.canvas.presentationReport["presentationTransform"] as? [CGFloat] ?? []
        return t.count == 6 && abs(t[0] - initialScale * scale) < 0.001
      }, "Complex board did not project while the gesture remained active")
      slowestProjection = max(slowestProjection, (CACurrentMediaTime() - started) * 1000)
    }
    print("Complex-board active camera projection max \(slowestProjection) ms")
    let attachment = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
      window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
    })
    attachment.name = "Complex board before lifting fingers"
    attachment.lifetime = .keepAlways
    add(attachment)
    event.phase = .ended
    let refinementStarted = CACurrentMediaTime()
    let firstTiles = canvas.refinementTilesPublished
    controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
    // Let a display tick start the expensive refinement, then begin drawing immediately.
    XCTAssertTrue(until(timeout: 0.3) { self.controller.cameraRefinementJobs > refinements },
      "The regression did not actually exercise a camera refinement job")
    XCTAssertTrue(until(timeout: 0.25) { self.canvas.refinementTilesPublished > firstTiles }, "Camera did not progressively publish new detail")
    let firstPublicationMs = (CACurrentMediaTime() - refinementStarted)*1000
    print("Complex-board deep zoom first visible tile after \(firstPublicationMs) ms")
    let progressive = XCTAttachment(image: UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
      window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
    })
    progressive.name = "Progressive detail over projected board"
    progressive.lifetime = .keepAlways
    add(progressive)
    XCTAssertGreaterThan((canvas.presentationReport["modelTransform"] as? [CGFloat])?[0] ?? 0, 1.1)
    try button(205).sendActions(for: .touchUpInside)
    try button(0).sendActions(for: .touchUpInside)
    let started = CACurrentMediaTime()
    beginInk()
    XCTAssertTrue(until(timeout: 0.3) { self.canvas.preview.image != nil },
      "Live ink waits behind a full complex-board raster after camera movement")
    print("Complex-board live ink visible after \((CACurrentMediaTime() - started) * 1000) ms")
    let first = canvas.preview
    finishInk()
    beginInk()
    XCTAssertTrue(until(timeout: 0.3) { self.canvas.preview !== first && self.canvas.preview.image != nil })
    XCTAssertNotNil(first.superview, "Beginning another stroke erased ink still waiting for base publication")
    finishInk()
    XCTAssertTrue(until(timeout: 20) { (self.canvas.presentationReport["inkLayers"] as? Int) == 0 },
      "Completed ink was never merged into the committed raster")
    let refinementMs = (CACurrentMediaTime() - refinementStarted) * 1000
    print("Complex-board refined with new ink after \(refinementMs) ms")
    print("Complex-board first tile \(controller.lastRefinementFirstTileMs) ms; raster job \(controller.lastRefinementCompleteMs) ms; cache hits \(controller.lastRefinementTileHits)")
    XCTAssertLessThan(refinementMs, 1500, "Refinement plus concurrent ink exceeded its budget")
    XCTAssertLessThan(controller.lastRefinementCompleteMs, 1000, "Detailed raster job exceeded one second")
    XCTAssertGreaterThan(canvas.refinementTilesPublished, 0, "Refinement never published progressive tiles")
    XCTAssertLessThan(controller.lastRefinementFirstTileMs, 250, "No visible detailed tile within the refinement budget")
    // Both zooms pass the coverage/detail reuse limits and must refine.
    // The second view overlaps the first, exercising compiled path reuse.
    for scale in [CGFloat(0.5), CGFloat(2.2)] {
      let previous = canvas.image
      let jobs = controller.cameraRefinementJobs
      let tilesBefore = canvas.refinementTilesPublished
      event.phase = .began
      controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
      pinch.scale = scale
      event.phase = .changed
      controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
      event.phase = .ended
      let start = CACurrentMediaTime()
      controller.perform(NSSelectorFromString("cameraChanged:"), with: event)
      XCTAssertTrue(until(timeout: 0.25) { self.canvas.refinementTilesPublished > tilesBefore && self.controller.cameraRefinementJobs > jobs }, "Zoom waited for a complete frame before publishing detail")
      print("Complex-board repeated zoom first tile \(controller.lastRefinementFirstTileMs) ms")
      XCTAssertTrue(until(timeout: 10) { self.canvas.image !== previous })
      XCTAssertLessThan((CACurrentMediaTime()-start)*1000,1500,"Repeated zoom did not finish within its budget")
      XCTAssertLessThan(controller.lastRefinementCompleteMs, 1000, "Repeated zoom raster job exceeded one second")
      XCTAssertGreaterThan(controller.cameraRefinementJobs, jobs)
      print("Complex-board repeated zoom refined after \((CACurrentMediaTime() - start) * 1000) ms; raster \(controller.lastRefinementRasterSize)")
      print("Complex-board observed memory footprint \(physicalFootprintMiB()) MiB")
    }
  }
}

private final class CameraEvent: UIGestureRecognizer {
  var phase: UIGestureRecognizer.State = .possible
  override var state: UIGestureRecognizer.State { get { phase } set { phase = newValue } }
}

/// Unit-test doubles only: no system events or private touch injection APIs.
private final class TestTouch: UITouch {
  let sampleType: UITouch.TouchType
  var samplePhase: UITouch.Phase = .began
  var point = CGPoint(x: 100, y: 100)
  init(_ type: UITouch.TouchType) { sampleType = type; super.init() }
  override var type: UITouch.TouchType { sampleType }
  override var phase: UITouch.Phase { samplePhase }
  override var timestamp: TimeInterval { 1 }
  override var force: CGFloat { 0.5 }
  override var maximumPossibleForce: CGFloat { 1 }
  override func location(in view: UIView?) -> CGPoint { point }
}
