import XCTest
import UIKit
import CubeNotes
@testable import AuroraPrimeOffice

/// Exercises the production wgpu display path, not the CPU reference renderer.
@MainActor final class NativeGpuCanvasTests:XCTestCase {
  private var window:UIWindow!
  private var controller:NativeNotesViewController!
  private var canvas:NativeInkView!
  private var directory:URL!
  override func setUpWithError() throws {
    continueAfterFailure=false
    UIApplication.shared.isIdleTimerDisabled=true
    directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
    let file=directory.appendingPathComponent("GPU.cubenote")
    try Data().write(to:file)
    controller=NativeNotesViewController()
    try controller.prepareEmbedded(at:file,fileName:file.lastPathComponent,readonly:true) {_,_,_ in}
    window=UIWindow(windowScene:try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene))
    // Programmatic hosted tests own this window; real touches must not interleave
    // with the injected Pencil sequence while a human uses the connected iPad.
    window.isUserInteractionEnabled=false
    window.rootViewController=controller;window.makeKeyAndVisible();window.layoutIfNeeded()
    canvas=try XCTUnwrap(descendants(controller.view).compactMap{$0 as? NativeInkView}.first)
    XCTAssertTrue(until(timeout:20){self.controller.gpuSequence>0},"GPU never presented first frame")
    XCTAssertTrue(controller.gpuEnabled,"Production silently fell back to CPU")
    XCTAssertEqual(controller.gpuReport["backend"] as? String,"wgpu-metal")
    XCTAssertNil(canvas.image,"CPU board bitmap still used for live display")
  }
  override func tearDownWithError() throws {
    var flushed=false;controller.flushNativeDraft {flushed=true}
    XCTAssertTrue(until(timeout:20){flushed})
    window.isHidden=true;window.rootViewController=nil;canvas=nil;controller=nil;window=nil
    try FileManager.default.removeItem(at:directory)
  }
  private func descendants(_ v:UIView)->[UIView] {[v]+v.subviews.flatMap(descendants)}
  private func button(_ id:Int)throws->UIButton {try XCTUnwrap(descendants(controller.view).compactMap{$0 as? UIButton}.first{$0.accessibilityIdentifier=="rust-action-\(id)"})}
  @discardableResult private func until(timeout:TimeInterval=4,_ condition:()->Bool)->Bool {
    let end=Date().addingTimeInterval(timeout)
    while !condition() && Date()<end {RunLoop.main.run(until:Date().addingTimeInterval(0.005))}
    return condition()
  }
  private func p(_ i:Int)->InputSample {
    let t=Double(i)*0.006
    let v=canvas.world?(CGPoint(x:300+220*sin(t*0.31),y:350+250*sin(t))) ?? .zero
    return InputSample(x:v.x,y:v.y,pressure:0.5+0.3*sin(t*0.7),time_ms:Double(i)*4)
  }
  private func pixelSample(_ x:Double,_ y:Double,_ time:Double=0)->InputSample {
    let v=canvas.world?(CGPoint(x:x,y:y)) ?? .zero
    return InputSample(x:v.x,y:v.y,pressure:0.5,time_ms:time)
  }
  private func settled() {
    RunLoop.main.run(until:Date().addingTimeInterval(0.08))
  }
  private func pixels()->Data {
    var data:Data?
    controller.gpuPixels {data=$0}
    XCTAssertTrue(until(timeout:15){data != nil})
    XCTAssertEqual(data?.count,800*800*4)
    return data ?? Data()
  }
  func testAllBrushesLongTailsStayInteractiveAndUndoRedo() throws {
    try button(205).sendActions(for:.touchUpInside)
    let names=["ballpoint","fountain","brush","pencil","watercolor","marker","crayon","reed","spray","oil","highlighter"]
    for style in 0...10 {
      try button(style).sendActions(for:.touchUpInside)
      controller.presentedViewController?.dismiss(animated:false)
      settled()
      canvas.input?(0,-800,true,[p(0)])
      var previous=1
      for count in [64,512,2048,8192] {
        let first=controller.inkFramesPublished
        let start=CACurrentMediaTime()
        canvas.input?(1,-800,true,(previous..<count).map(p))
        let inputMs=(CACurrentMediaTime()-start)*1000
        XCTAssertTrue(until(timeout:20){self.controller.inkFramesPublished>first},"\(names[style]) catchup never displayed")
        let catchup=controller.lastInkRenderMs
        let next=controller.inkFramesPublished
        canvas.input?(1,-800,true,(count..<count+16).map(p))
        XCTAssertTrue(until(timeout:20){self.controller.inkFramesPublished>next})
        print("GPU DEVICE \(names[style]) n=\(count) input=\(inputMs) catchup=\(catchup) tail16=\(controller.lastInkRenderMs) report=\(controller.gpuReport)")
        XCTAssertLessThan(inputMs,50)
        XCTAssertLessThan(controller.lastInkRenderMs,50,"\(names[style]) long-tail frame exceeded 50 ms")
        previous=count+16
      }
      canvas.input?(2,-800,true,[])
      settled();let ink=pixels()
      try button(100).sendActions(for:.touchUpInside);settled();let undone=pixels()
      XCTAssertNotEqual(ink,undone,"\(names[style]) undo did not change actual GPU pixels")
      try button(101).sendActions(for:.touchUpInside);settled();XCTAssertEqual(pixels(),ink,"\(names[style]) redo changed appearance")
      try button(100).sendActions(for:.touchUpInside);settled()
      XCTAssertTrue(controller.gpuEnabled)
      XCTAssertNil(controller.presentedViewController)
    }
  }
  func testContinuousChineseBrushThrough32769Points() throws {
    try button(205).sendActions(for:.touchUpInside)
    try button(2).sendActions(for:.touchUpInside)
    var early:[Double]=[],late:[Double]=[],extended:[Double]=[]
    var largestInput=0.0,largestBristleSections=0,largestTailUpload=0
    canvas.input?(0,-991,true,[p(0)])
    for batch in 0..<2048 {
      let before=controller.inkFramesPublished,start=CACurrentMediaTime()
      canvas.input?(1,-991,true,(batch*16+1...batch*16+16).map(p))
      largestInput=max(largestInput,(CACurrentMediaTime()-start)*1000)
      XCTAssertTrue(until(timeout:2){self.controller.inkFramesPublished>before},"Chinese brush stopped at batch \(batch)")
      let elapsed=controller.lastInkRenderMs
      if batch<64 {early.append(elapsed)}
      if batch>=448 && batch<512 {late.append(elapsed)}
      if batch>=1984 {extended.append(elapsed)}
      if batch>=448 {
        largestBristleSections=max(largestBristleSections,controller.gpuReport["bristleSectionsUpdated"] as? Int ?? 0)
        // Exclude capacity growth from the steady-state byte check.
        let bytes=controller.gpuReport["bristleBytesUploaded"] as? Int ?? 0
        if bytes<100_000 {largestTailUpload=max(largestTailUpload,bytes)}
      }
      if batch==511 {print("GPU CHINESE 8193 early p95 \(early.sorted()[59]) late p95 \(late.sorted()[59]) max \(late.max()!) ms report=\(controller.gpuReport)")}
    }
    print("GPU CHINESE 32769 late p95 \(extended.sorted()[59]) max \(extended.max()!) input max \(largestInput) capture max \(controller.maxInkCaptureMs) bristle sections max \(largestBristleSections) steady upload max \(largestTailUpload) report=\(controller.gpuReport)")
    XCTAssertLessThan(late.sorted()[59],20,"8193-point brush still rebuilds its complete bristles")
    XCTAssertLessThan(extended.sorted()[59],50,"32769-point brush exceeds long-stroke budget")
    XCTAssertLessThan(largestInput,50)
    XCTAssertLessThan(controller.maxInkCaptureMs,50)
    XCTAssertLessThanOrEqual(largestBristleSections,17*18,"Existing bristles were recomputed")
    canvas.input?(2,-991,true,[p(32769)]);settled()
    let painted=pixels()
    try button(100).sendActions(for:.touchUpInside);settled();let undone=pixels()
    XCTAssertNotEqual(painted,undone)
    try button(101).sendActions(for:.touchUpInside);settled();XCTAssertEqual(pixels(),painted)
    var saved=false;controller.flushNativeDraft{saved=true};XCTAssertTrue(until(timeout:20){saved})
    let file=directory.appendingPathComponent("GPU.cubenote"),before=controller.gpuSequence
    try controller.prepareEmbedded(at:file,fileName:file.lastPathComponent,readonly:false){_,_,_ in}
    controller.resumeNativeTiming();XCTAssertTrue(until(timeout:20){self.controller.gpuSequence>before})
    XCTAssertEqual(pixels(),painted)
    try button(0).sendActions(for:.touchUpInside)
    let publication=controller.inkFramesPublished
    canvas.input?(0,-992,true,[pixelSample(100,100)])
    canvas.input?(1,-992,true,[pixelSample(180,140,10)])
    XCTAssertTrue(until{self.controller.inkFramesPublished>publication},"Long brush blocked the next stroke")
    canvas.input?(2,-992,true,[])
    XCTAssertTrue(controller.gpuEnabled)
    XCTAssertNil(controller.presentedViewController)
  }
  func testContinuousOilStrokeAndRepeatedPencilAfterAutosave() throws {
    try button(205).sendActions(for:.touchUpInside)
    try button(9).sendActions(for:.touchUpInside)
    var times:[Double]=[]
    canvas.input?(0,-990,true,[p(0)])
    for batch in 0..<512 {
      let before=controller.inkFramesPublished
      canvas.input?(1,-990,true,(batch*16+1...batch*16+16).map(p))
      XCTAssertTrue(until(timeout:2){self.controller.inkFramesPublished>before},"Oil stopped at batch \(batch)")
      if batch>=448 {times.append(controller.lastInkRenderMs)}
    }
    print("GPU CONTINUOUS OIL late p95 \(times.sorted()[59]) max \(times.max()!) ms")
    XCTAssertLessThan(times.sorted()[59],50)
    canvas.input?(2,-990,true,[]);settled()
    for i in 0..<24 {
      try button(i%10).sendActions(for:.touchUpInside)
      controller.presentedViewController?.dismiss(animated:false)
      if i%4==0 {
        let picker=UIColorPickerViewController();picker.selectedColor=UIColor(red:0.3,green:0.4,blue:0.8,alpha:1)
        controller.colorPickerViewControllerDidSelectColor(picker)
      }
      let before=controller.inkFramesPublished
      let pencil=GpuTestTouch(.pencil)
      canvas.touchesBegan([pencil],with:nil)
      pencil.samplePhase = .moved;pencil.point=CGPoint(x:180,y:140)
      canvas.touchesMoved([pencil],with:nil)
      XCTAssertTrue(until(timeout:1){self.controller.inkFramesPublished>before},"Pencil stopped on stroke \(i)")
      let palm=GpuTestTouch(.direct);palm.samplePhase = .cancelled
      canvas.touchesCancelled([palm],with:nil)
      pencil.samplePhase = .ended;canvas.touchesEnded([pencil],with:nil)
      if i%6==5 {var done=false;controller.flushNativeDraft{done=true};XCTAssertTrue(until(timeout:20){done});controller.resumeNativeTiming()}
      XCTAssertTrue(canvas.drawingEnabled)
      XCTAssertNil(controller.presentedViewController)
    }
    settled();let painted=pixels()
    var saved=false;controller.flushNativeDraft{saved=true};XCTAssertTrue(until(timeout:20){saved})
    let file=directory.appendingPathComponent("GPU.cubenote")
    XCTAssertGreaterThan(try Data(contentsOf:file).count,0)
    let sequence=controller.gpuSequence
    try controller.prepareEmbedded(at:file,fileName:file.lastPathComponent,readonly:false){_,_,_ in}
    controller.resumeNativeTiming()
    XCTAssertTrue(until(timeout:20){self.controller.gpuSequence>sequence})
    XCTAssertEqual(pixels(),painted,"Saving/reopening changed the existing .cubenote content")
    XCTAssertTrue(try button(100).isEnabled,"Undo history was lost across reopening")
    XCTAssertTrue(controller.gpuEnabled)
  }
  func testDenseOldBoardCameraAndBothErasers() throws {
    let fixture=FileManager.default.urls(for:.cachesDirectory,in:.userDomainMask)[0].appendingPathComponent("NativeCanvasRegression.cubenote")
    guard FileManager.default.fileExists(atPath:fixture.path) else {throw XCTSkip("Private fixture not installed")}
    let file=directory.appendingPathComponent("Old.cubenote");try FileManager.default.copyItem(at:fixture,to:file)
    let before=controller.gpuSequence,started=CACurrentMediaTime()
    try controller.prepareEmbedded(at:file,fileName:file.lastPathComponent,readonly:false) {_,_,_ in}
    XCTAssertTrue(until(timeout:20){self.controller.gpuSequence>before && self.controller.openingReport["detailedRasterMs"] != nil})
    print("GPU OLD BOARD first frame \((CACurrentMediaTime()-started)*1000) ms \(controller.gpuReport)")
    XCTAssertLessThan((CACurrentMediaTime()-started)*1000,2000)
    settled();let initial=pixels()
    let pan=try XCTUnwrap(canvas.gestureRecognizers?.compactMap{$0 as? UIPanGestureRecognizer}.first)
    let pinch=try XCTUnwrap(canvas.gestureRecognizers?.compactMap{$0 as? UIPinchGestureRecognizer}.first)
    let event=GpuCameraEvent();event.phase = .began
    controller.perform(NSSelectorFromString("cameraChanged:"),with:event)
    let uploads=controller.gpuReport["uploads"] as? Int
    var times:[Double]=[]
    for i in 1...40 {
      let seq=controller.gpuSequence,start=CACurrentMediaTime()
      pan.setTranslation(CGPoint(x:i*3,y:i*2),in:canvas);pinch.scale=1+CGFloat(i)*0.04;event.phase = .changed
      controller.perform(NSSelectorFromString("cameraChanged:"),with:event)
      XCTAssertTrue(until(timeout:0.25){self.controller.gpuSequence>seq},"Camera only updated after lifting fingers")
      times.append((CACurrentMediaTime()-start)*1000)
      XCTAssertEqual(controller.gpuReport["uploads"] as? Int,uploads,"Camera rebuilt unchanged meshes")
    }
    event.phase = .ended;controller.perform(NSSelectorFromString("cameraChanged:"),with:event)
    print("GPU CAMERA active frame p95 \(times.sorted()[37]) max \(times.max()!) ms \(controller.gpuReport)")
    XCTAssertLessThan(times.sorted()[37],50)
    XCTAssertNotEqual(pixels(),initial,"Camera did not change actual GPU pixels")
    for mode in ["轨迹擦除","整笔擦除"] {
      try button(11).sendActions(for:.touchUpInside)
      if controller.presentedViewController==nil {try button(11).sendActions(for:.touchUpInside)}
      let panel=try XCTUnwrap(controller.presentedViewController);panel.loadViewIfNeeded()
      let choice=try XCTUnwrap(descendants(panel.view).compactMap{$0 as? UIButton}.first{$0.accessibilityLabel==mode})
      choice.sendActions(for:.touchUpInside);panel.dismiss(animated:false);settled()
      let old=pixels();var times:[Double]=[]
      for i in 0..<16 {
        let seq=controller.gpuSequence,start=CACurrentMediaTime()
        canvas.input?(i==0 ? 0:1,-890,true,[pixelSample(70+Double(i)*22,250+Double(i)*9,Double(i)*8)])
        XCTAssertTrue(until(timeout:1){self.controller.gpuSequence>seq})
        times.append((CACurrentMediaTime()-start)*1000)
      }
      canvas.input?(2,-890,true,[]);settled()
      print("GPU ERASER \(mode) frame p95 \(times.sorted()[14]) max \(times.max()!) apply max \(controller.maxEraserApplyMs) ms")
      XCTAssertLessThan(times.sorted()[14],250,"Existing erase budget must not be relaxed")
      XCTAssertNotEqual(pixels(),old,"\(mode) did not change actual GPU pixels")
      try button(100).sendActions(for:.touchUpInside);settled();XCTAssertEqual(pixels(),old,"Undo erased old content permanently")
    }
    XCTAssertTrue(controller.gpuEnabled)
    XCTAssertNil(controller.presentedViewController)
  }
  func testLegacyPagedBoardAcceptsPencilPastPaperAndRetainsInkAfterReopen() throws {
    let file=directory.appendingPathComponent("OldPaged.cubenote")
    let xml="""
    <xournal><page width="595.28" height="72"><background type="solid" color="#ffffffff" style="plain"/><layer/></page></xournal>
    """
    try Data(xml.utf8).write(to:file)
    let sequence=controller.gpuSequence
    try controller.prepareEmbedded(at:file,fileName:file.lastPathComponent,readonly:false){_,_,_ in}
    controller.resumeNativeTiming()
    XCTAssertTrue(until(timeout:20){self.controller.gpuSequence>sequence})
    let blank=pixels()
    let touch=GpuTestTouch(.pencil)
    touch.point=CGPoint(x:canvas.bounds.width*0.2,y:canvas.bounds.height*0.5)
    XCTAssertGreaterThan(try XCTUnwrap(canvas.world?(touch.point)).y,72,"Test must start below the original page")
    canvas.touchesBegan([touch],with:nil)
    touch.samplePhase = .moved
    touch.point=CGPoint(x:canvas.bounds.width*0.7,y:canvas.bounds.height*0.75)
    let before=controller.inkFramesPublished
    canvas.touchesMoved([touch],with:nil)
    XCTAssertTrue(until(timeout:10){self.controller.inkFramesPublished>before})
    touch.samplePhase = .ended;canvas.touchesEnded([touch],with:nil)
    settled();let painted=pixels()
    XCTAssertNotEqual(painted,blank)
    let changed=painted.withUnsafeBytes{raw->Int in
      let p=raw.bindMemory(to:UInt8.self)
      return (360..<650).reduce(0){sum,y in sum+(120..<610).filter{x in
        let i=(y*800+x)*4;return p[i]<200 || p[i+1]<200 || p[i+2]<200
      }.count}
    }
    XCTAssertGreaterThan(changed,80,"Ink was clamped to the old page edge instead of appearing below it")
    try button(100).sendActions(for:.touchUpInside);settled();XCTAssertEqual(pixels(),blank)
    try button(101).sendActions(for:.touchUpInside);settled();XCTAssertEqual(pixels(),painted)
    var saved=false;controller.flushNativeDraft{saved=true};XCTAssertTrue(until(timeout:20){saved})
    let next=controller.gpuSequence
    try controller.prepareEmbedded(at:file,fileName:file.lastPathComponent,readonly:false){_,_,_ in}
    controller.resumeNativeTiming();XCTAssertTrue(until(timeout:20){self.controller.gpuSequence>next})
    let reopened=pixels()
    XCTAssertNotEqual(reopened,blank,"Saved off-page ink disappeared after reopening")
    XCTAssertTrue(try button(100).isEnabled)
    try button(100).sendActions(for:.touchUpInside);settled();XCTAssertEqual(pixels(),blank)
    try button(101).sendActions(for:.touchUpInside);settled();XCTAssertEqual(pixels(),reopened)
  }
  func testSelectionMenuMoveDeleteAndColorStillUseOriginalChrome() throws {
    try button(205).sendActions(for:.touchUpInside)
    try button(301).sendActions(for:.touchUpInside)
    canvas.input?(0,-10,true,[pixelSample(100,100)])
    canvas.input?(1,-10,true,[pixelSample(140,120,10),pixelSample(200,160,20)])
    canvas.input?(2,-10,true,[pixelSample(230,170,30)]);settled()
    let original=pixels()
    try button(12).sendActions(for:.touchUpInside)
    let tap=pixelSample(180,147)
    canvas.input?(0,-11,true,[tap]);canvas.input?(2,-11,true,[tap]);settled()
    let delete=try XCTUnwrap(descendants(controller.view).compactMap{$0 as? UIButton}.first{$0.accessibilityIdentifier=="native-selection-delete"})
    XCTAssertTrue(until{!(delete.superview?.isHidden ?? true)})
    XCTAssertEqual(delete.superview?.layer.cornerRadius,28)
    let seq=controller.gpuSequence
    canvas.input?(0,-12,true,[tap]);canvas.input?(1,-12,true,[pixelSample(290,250,10)])
    XCTAssertTrue(until{self.controller.gpuSequence>seq})
    XCTAssertNotEqual(pixels(),original,"Selected object did not follow before pointer up")
    canvas.input?(2,-12,true,[]);settled()
    delete.sendActions(for:.touchUpInside);settled();let erased=pixels()
    XCTAssertNotEqual(erased,original)
    try button(100).sendActions(for:.touchUpInside);settled();XCTAssertNotEqual(pixels(),erased)
    XCTAssertTrue(controller.gpuEnabled)
    XCTAssertNil(controller.presentedViewController)
  }
}
private final class GpuCameraEvent:UIGestureRecognizer {
  var phase:UIGestureRecognizer.State = .possible
  override var state:UIGestureRecognizer.State {get{phase}set{phase=newValue}}
}

private final class GpuTestTouch:UITouch {
  let sampleType:UITouch.TouchType
  var samplePhase:UITouch.Phase = .began
  var point=CGPoint(x:100,y:100)
  init(_ type:UITouch.TouchType){sampleType=type;super.init()}
  override var type:UITouch.TouchType {sampleType}
  override var phase:UITouch.Phase {samplePhase}
  override var timestamp:TimeInterval {1}
  override var force:CGFloat {0.5}
  override var maximumPossibleForce:CGFloat {1}
  override func location(in view:UIView?)->CGPoint {point}
}
