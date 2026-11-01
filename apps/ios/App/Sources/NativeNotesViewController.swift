#if CUBE_NATIVE_NOTES
  import UIKit
  import CubeNotes
  import os
  import CoreText
  import UniformTypeIdentifiers
  import PhotosUI

  private final class NativeFrameTick: NSObject {
    weak var owner: NativeNotesViewController?
    init(_ owner: NativeNotesViewController) { self.owner = owner }
    @objc func tick() { owner?.drawFrame() }
  }

  /// Thin UIKit adapter for the Rust surface: OS events, native controls, pixels and file services.
  /// Embedded by CubeOffice's existing workspace for native notebook editing.
  private final class NativePixelRenderer {
    let handle = cube_surface_renderer_new()!
    private var fontsLoaded = false
    func prepareFonts(for frame: OpaquePointer) {
      guard !fontsLoaded, cube_surface_frame_needs_fonts(frame) != 0 else { return }
      // SFUI's private system font is not a portable outline font. Use an OS
      // document font plus a portable CJK fallback. PingFangUI uses Apple-only
      // outline tables, so loading that collection can silently erase CJK text.
      let font = CTFontCreateWithName("ArialMT" as CFString, 17, nil)
      let urls = [CTFontDescriptorCopyAttribute(CTFontCopyFontDescriptor(font), kCTFontURLAttribute) as? URL,
        Bundle.main.url(forResource: "NotoSansCJKsc-Regular", withExtension: "otf", subdirectory: "NotesFonts")]
      for url in urls.compactMap({ $0 }) {
        if let data = try? Data(contentsOf: url, options: .mappedIfSafe) {
          let code = data.withUnsafeBytes { cube_surface_renderer_font(handle, $0.bindMemory(to: UInt8.self).baseAddress, $0.count) }
          if code == 0 { fontsLoaded = true }
          if code != 0 {
            let error = Data(bytes: cube_surface_renderer_output_ptr(handle), count: cube_surface_renderer_output_len(handle))
            Logger(subsystem: "com.cubexp.office", category: "native-fonts").error("Font \(url.lastPathComponent, privacy: .public): \(String(data: error, encoding: .utf8) ?? "load failed", privacy: .public)")
          }
        }
      }
    }
    deinit { cube_surface_renderer_free(handle) }
  }

  // Main thread invalidates; only the render worker reads this flag.
  private final class NativeRenderCancellation {
    private let lock = NSLock()
    let nativeToken = cube_surface_cancellation_new()!
    private var stopped = false
    func cancel() {
      lock.lock(); stopped = true; lock.unlock()
      cube_surface_cancellation_cancel(nativeToken)
    }
    deinit { cube_surface_cancellation_free(nativeToken) }
    var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return stopped }
  }

  final class NativeInkView: UIView {
    private let raster = UIView()
    private let inkHost = UIView()
    private let refinementHost = UIView()
    private var refinementViewport: [String: Double]?
    private var refinementSize = CGSize.zero
    private(set) var refinementTilesPublished = 0
    let metal = NativeMetalCanvas(frame: .zero)
    private let committed = UIImageView()
    private let selectionPatch = UIImageView()
    private let selectionObject = UIImageView()
    private var selectionSource: [String: Double]?
    private var selectionOriginal: [String: Double]?
    private var selectionCurrent: [String: Double]?
    var selectionPreviewVisible: Bool { selectionObject.image != nil }
    var image: UIImage? {
      get { committed.image }
      set { committed.image = newValue; clearRefinement(); clearSelectionPreview() }
    }
    private(set) var preview = UIImageView()
    private struct InkLayer {
      let host: UIView
      let image: UIImageView
      let revision: UInt64
      let viewport: [String: Double]
    }
    private var inkLayers: [Int: InkLayer] = [:]
    private var currentViewport: [String: Double]?
    var input: ((UInt32, Int64, Bool, [InputSample]) -> Void)?
    var world: ((CGPoint) -> CGPoint)?
    var drawingEnabled = true
    var acceptFinger = true
    var hasPencilInput: Bool { active?.type == .pencil }
    var hasActiveInput: Bool { active != nil }
    private var active: UITouch?
    private var touchCounts: [String: Int] = [:]
    var touchReport: [String: Any] {
      ["counts": touchCounts, "active": active != nil,
        "pencil": hasPencilInput, "phase": active?.phase.rawValue ?? -1]
    }
    override init(frame: CGRect) {
      super.init(frame: frame)
      isOpaque = false
      isUserInteractionEnabled = true
      isMultipleTouchEnabled = true
      clipsToBounds = true
      raster.isUserInteractionEnabled = false
      raster.isOpaque = false
      raster.layer.anchorPoint = .zero
      committed.contentMode = .scaleToFill
      raster.addSubview(committed)
      addSubview(metal)
      addSubview(raster)
      refinementHost.isUserInteractionEnabled = false
      refinementHost.layer.anchorPoint = .zero
      refinementHost.layer.position = .zero
      addSubview(refinementHost)
      // Completed ink may still be awaiting its base-raster publication when a
      // selection starts. Keep it below both selection replacement layers, so
      // the erased origin cannot be covered by an older asynchronous ink patch.
      inkHost.isUserInteractionEnabled = false
      inkHost.isOpaque = false
      addSubview(inkHost)
      selectionPatch.accessibilityIdentifier = "native-selection-background-patch"
      selectionObject.accessibilityIdentifier = "native-selection-object-preview"
      for image in [selectionPatch, selectionObject] {
        image.contentMode = .scaleToFill
        image.isUserInteractionEnabled = false
        image.layer.anchorPoint = .zero
        image.layer.position = .zero
        addSubview(image)
      }
    }
    override func layoutSubviews() {
      super.layoutSubviews()
      metal.frame = bounds
      raster.bounds = bounds
      raster.layer.position = .zero
      committed.frame = bounds
      inkHost.frame = bounds
      refinementHost.bounds = bounds
      selectionPatch.bounds = bounds
      selectionObject.bounds = bounds
    }
    func projectRaster(_ transform: CGAffineTransform) {
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      raster.layer.setAffineTransform(transform)
      CATransaction.commit()
    }
    func projectInk(to viewport: [String: Double]) {
      currentViewport = viewport
      projectSelection(to: viewport)
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      if let source = refinementViewport {
        refinementHost.layer.setAffineTransform(NativeCanvasProjection.transform(from: source, to: viewport, size: bounds.size))
      }
      for ink in inkLayers.values {
        ink.host.layer.setAffineTransform(NativeCanvasProjection.transform(
          from: ink.viewport, to: viewport, size: bounds.size))
      }
      CATransaction.commit()
    }
    func clearSelectionPreview() {
      selectionPatch.image = nil
      selectionObject.image = nil
      selectionSource = nil
      selectionOriginal = nil
      selectionCurrent = nil
    }
    func showSelectionPreview(background: UIImage, foreground: UIImage,
      source: [String: Double], origin: [String: Double], current: [String: Double]) {
      selectionSource = source
      selectionOriginal = origin
      selectionCurrent = current
      selectionPatch.image = background
      selectionObject.image = foreground
      if let currentViewport { projectSelection(to: currentViewport) }
    }
    func moveSelectionPreview(to current: [String: Double]) {
      selectionCurrent = current
      if let currentViewport { projectSelection(to: currentViewport) }
    }
    private func projectSelection(to viewport: [String: Double]) {
      guard let source = selectionSource, let original = selectionOriginal, let current = selectionCurrent else { return }
      let sx = (current["width"] ?? 1) / max(0.001, original["width"] ?? 1)
      let sy = (current["height"] ?? 1) / max(0.001, original["height"] ?? 1)
      let moved = ["x": (current["x"] ?? 0) + ((source["x"] ?? 0) - (original["x"] ?? 0)) * sx,
        "y": (current["y"] ?? 0) + ((source["y"] ?? 0) - (original["y"] ?? 0)) * sy,
        "width": (source["width"] ?? 1) * sx, "height": (source["height"] ?? 1) * sy]
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      selectionPatch.layer.setAffineTransform(NativeCanvasProjection.transform(from: source, to: viewport, size: bounds.size))
      selectionObject.layer.setAffineTransform(NativeCanvasProjection.transform(from: moved, to: viewport, size: bounds.size))
      CATransaction.commit()
    }
    func clearRefinement() {
      refinementHost.subviews.forEach { $0.removeFromSuperview() }
      refinementViewport = nil
    }
    func beginRefinement(viewport: [String: Double], width: Int, height: Int) {
      clearRefinement()
      refinementViewport = viewport
      refinementSize = CGSize(width: width, height: height)
      if let currentViewport { projectInk(to: currentViewport) }
    }
    func publishTile(_ image: UIImage, x: Int, y: Int) {
      guard refinementViewport != nil else { return }
      let tile = UIImageView(image: image)
      tile.frame = CGRect(x: CGFloat(x)/refinementSize.width*bounds.width,
        y: CGFloat(y)/refinementSize.height*bounds.height,
        width: CGFloat(image.cgImage!.width)/refinementSize.width*bounds.width,
        height: CGFloat(image.cgImage!.height)/refinementSize.height*bounds.height)
      refinementHost.addSubview(tile)
      refinementTilesPublished += 1
    }
    func publishInk(_ image: UIImage, frame: CGRect, id: Int, revision: UInt64, viewport: [String: Double]) {
      let ink: InkLayer
      if let existing = inkLayers[id] { ink = existing }
      else {
        let host = UIView(frame: bounds)
        host.isUserInteractionEnabled = false
        host.isOpaque = false
        host.layer.anchorPoint = .zero
        host.layer.position = .zero
        let patch = UIImageView()
        patch.isUserInteractionEnabled = false
        host.addSubview(patch)
        // Ink stays above the committed raster and below selection/tape overlays.
        inkHost.addSubview(host)
        ink = InkLayer(host: host, image: patch, revision: revision, viewport: viewport)
        inkLayers[id] = ink
      }
      ink.image.frame = frame
      ink.image.image = image
      preview = ink.image
      if let currentViewport { projectInk(to: currentViewport) }
    }
    func removeInk(_ id: Int) {
      if let ink = inkLayers.removeValue(forKey: id) {
        ink.host.removeFromSuperview()
        if preview === ink.image { preview.image = nil }
      }
    }
    func acceptBase(revision: UInt64) {
      for (id, ink) in inkLayers where ink.revision <= revision { removeInk(id) }
    }
    func resetInk() {
      for id in Array(inkLayers.keys) { removeInk(id) }
      clearRefinement()
      clearSelectionPreview()
    }
    var presentationReport: [String: Any] {
      func values(_ t: CGAffineTransform) -> [CGFloat] { [t.a, t.b, t.c, t.d, t.tx, t.ty] }
      return ["imagePresent": committed.image != nil, "inkLayers": inkLayers.count,
        "selectionVisible": selectionPreviewVisible,
        "selectionTransform": values(selectionObject.transform),
        "selectionPresentation": selectionObject.layer.presentation().map {values($0.affineTransform())} ?? [],
        "rasterSize": [raster.bounds.width, raster.bounds.height],
        "imageViewSize": [committed.bounds.width, committed.bounds.height],
        "modelTransform": values(raster.transform),
        "presentationTransform": raster.layer.presentation().map { values($0.affineTransform()) } ?? []]
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    private func send(_ touch: UITouch, phase: UInt32, event: UIEvent?) {
      let points = (event?.coalescedTouches(for: touch) ?? [touch]).map { t -> InputSample in
        let p = world?(t.location(in: self)) ?? t.location(in: self)
        let pressure = t.maximumPossibleForce > 0 ? t.force / t.maximumPossibleForce : 0.5
        return InputSample(
          x: p.x, y: p.y, pressure: min(1, max(0, pressure)), time_ms: t.timestamp * 1000)
      }
      input?(
        phase, Int64(truncatingIfNeeded: ObjectIdentifier(touch).hashValue), touch.type == .pencil,
        points)
    }
    func cancelInput() {
      let touch = active
      active = nil
      if let touch { send(touch, phase: 3, event: nil) }
    }
    func abandonInput() { active = nil }
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
      touchCounts["began", default: 0] += touches.count
      guard drawingEnabled else { return }
      // A cancelled/ended UIKit touch must never latch Pencil ownership forever.
      if let active, [.ended, .cancelled].contains(active.phase) {
        touchCounts["staleRecovered", default: 0] += 1
        cancelInput()
      }
      let pencil = touches.first { $0.type == .pencil }
      if let active, active.type == .pencil {
        // Palm input cannot steal the Pencil. A Pencil .began is a new sequence,
        // including when UIKit recycles a touch after omitting its final callback.
        guard pencil != nil else { return }
        touchCounts["newPencilRecovered", default: 0] += 1
        cancelInput()
      }
      if active != nil {
        cancelInput()
        if pencil == nil { return }
      }
      guard let touch = pencil ?? touches.first, touch.type == .pencil || acceptFinger else {
        return
      }
      if pencil == nil
        && (event?.allTouches?.filter { $0.phase != .ended && $0.phase != .cancelled }.count ?? 1)
          != 1
      {
        return
      }
      active = touch
      send(touch, phase: 0, event: event)
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
      if let touch = active, touches.contains(touch) { send(touch, phase: 1, event: event) }
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
      touchCounts["ended", default: 0] += touches.count
      if let touch = active, touches.contains(touch) {
        active = nil
        send(touch, phase: 2, event: event)
      }
    }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
      touchCounts["cancelled", default: 0] += touches.count
      guard let active, touches.contains(active) else {
        touchCounts["unrelatedCancellationIgnored", default: 0] += 1
        return
      }
      cancelInput()
    }
  }

  final class NativeNotesViewController: UIViewController, UIColorPickerViewControllerDelegate,
    UIGestureRecognizerDelegate, UIPopoverPresentationControllerDelegate, UIDocumentPickerDelegate,
    PHPickerViewControllerDelegate, UIImagePickerControllerDelegate, UINavigationControllerDelegate,
    UIPencilInteractionDelegate
  {
    private var notebook = NativeNotebookSession()
    private var surface: OpaquePointer { notebook.handle }
    private(set) var openingReport: [String: Any] = [:]
    private var awaitingFirstRaster = false
    private var awaitingDetailedRaster = false
    // CPU remains the export/reference renderer, never the live GPU canvas.
    private(set) var gpuEnabled = true
    private var gpuWorker: NativeGpuWorker?
    private var gpuBusy = false
    private(set) var gpuSequence = 0
    private(set) var gpuReport: [String:Any] = [:]
    #if DEBUG
    convenience init(cpuReference: Bool) {
      self.init()
      gpuEnabled = !cpuReference
    }
    #endif
    private let pixelRenderer = NativePixelRenderer()
    private let inkRenderer = NativePixelRenderer()
    private let selectionRenderer = NativePixelRenderer()
    private let selectionQueue = DispatchQueue(label: "com.cubexp.notes.selection", qos: .userInteractive)
    private struct SelectionCache {
      let background: UIImage
      let foreground: UIImage
      let viewport: [String: Double]
      let origin: [String: Double]
    }
    private var selectionCacheKey: String?
    private var selectionCache: SelectionCache?
    private var wasSelectionManipulating = false
    private var selectionManipulating: Bool { state["selectionGesture"] is String }
    private let selectionToolbar = UIStackView()
    private let selectionCount = UILabel()
    private var selectionSwatches: [NativeSwatchButton] = []
    private var selectionActions: [Int: UIButton] = [:]
    private let selectionDivider = UIView()
    private(set) var selectionPreparationMs = 0.0
    private let inkQueue = DispatchQueue(label: "com.cubexp.notes.live-ink", qos: .userInteractive)
    private let renderQueue = DispatchQueue(
      label: "com.cubexp.notes.rust-render", qos: .userInteractive)
    private let saveQueue = DispatchQueue(label: "com.cubexp.notes.rust-save", qos: .utility)
    private let log = Logger(
      subsystem: Bundle.main.bundleIdentifier ?? "com.cubexp.office", category: "native-ink")
    private let canvas = NativeInkView(frame: .zero)
    private let canvasHost = UIView()
    struct PhotoDestination {
      let background: Bool
      let documentEpoch: UInt64
      let pageIndex: Int
    }
    private var pendingPhoto: PhotoDestination?
    private var sampling = false
    private var sampleBackground = false
    private var samplingGesture = false
    private var exporting = false
    private let titleLabel = UILabel()
    private let selectionLayer = CAShapeLayer()
    private let selectionHandles = CAShapeLayer()
    private let guideLayer = CAShapeLayer()
    private let guideLabels = UIView()
    private let tapeOverlay = UIView()
    private var thumbnailCache: [String: UIImage] = [:]
    private let statusLabel = UILabel()
    private let topbar = UIView()
    private let tray = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
    private let strip = NativeToolStrip()
    private let grip = UIButton(type: .system)
    private let gripMark = UIView()
    private var buttons: [Int: UIButton] = [:]
    private var toolImages: [String: UIImage] = [:]
    private var chromeImages: [String: UIImage] = [:]
    private var trayTranslation = CGPoint.zero
    private var state: [String: Any] = [:]
    private var displayLink: CADisplayLink?
    private var needsFrame = true
    private var rendering = false
    private struct PendingInk {
      let frame: OpaquePointer
      let id: Int
      let revision: UInt64
      let document: Int
      let viewport: [String: Double]
    }
    private var pendingInk: [PendingInk] = []
    private var inkRendering = false
    private var inkNeedsCapture = false
    private var queuedEraser: [InputSample] = []
    private var queuedEraserToken: Int64 = 0
    private var queuedEraserStylus = false
    private var applyingEraser = false
    private(set) var maxEraserApplyMs = 0.0
    private(set) var lastInkRenderMs = 0.0
    private(set) var inkFramesPublished = 0
    private(set) var maxInkCaptureMs = 0.0
    private var inkActive = false
    private var inkID = 0
    private var cancelledInk = Set<Int>()
    private var publishedRevision: UInt64 = 0
    private var needsBasePublication = true
    private var renderCancellation: NativeRenderCancellation?
    private var renderGeneration = 0 { didSet { renderCancellation?.cancel() } }
    private(set) var lastRefinementFirstTileMs = 0.0
    private(set) var lastRefinementCompleteMs = 0.0
    private(set) var lastRefinementTileHits = 0
    private(set) var lastRefinementRasterSize = CGSize.zero
    private var documentGeneration = 0
    private var inputViewport: [String: Double]?
    private var cameraBase: [String: Double]?
    private var nativeCameraGesture = false
    private var imageViewport: [String: Double]?
    private var imageDocument: Int?
    private var imageIsDetailed = false
    private(set) var cameraRasterReuses = 0
    private var cameraGestures = 0
    private var cameraUpdates = 0
    private var cameraProjections = 0
    private var cameraMovingProjections = 0
    private var cameraProjectionMaxMs = 0.0
    private var cameraDeferredFrames = 0
    private(set) var cameraRefinementJobs = 0
    private var cameraNeedsRefinement = false
    private var pan: UIPanGestureRecognizer!
    private var pinch: UIPinchGestureRecognizer!
    private var saveURL: URL?
    private var saving = false
    private var autosaveWork: DispatchWorkItem?
    private var pendingLibrary = false
    private var lastLayout = CGSize.zero
    private var lastFrameTick: CFTimeInterval = 0
    private var lastMetricsWrite: CFTimeInterval = 0
    private var embeddedName: String?
    private var embeddedRevision: UInt64 = 0
    private var pendingEmbeddedClose = false
    private var embeddedClosing = false
    private var backgroundFlushes: [() -> Void] = []
    private var embeddedClosed: ((URL, Bool, String?) -> Void)?
    var draftSaved: ((Bool) -> Void)?
    func showHostError(_ message: String) {
      embeddedClosing = false
      showError(message)
    }

    override func viewDidLoad() {
      super.viewDidLoad()
      view.backgroundColor = .systemBackground
      canvas.isAccessibilityElement = true
      canvas.accessibilityIdentifier = "cubeoffice-native-ink"
      canvas.accessibilityLabel = "画布"
      view.addSubview(canvasHost)
      canvasHost.addSubview(canvas)
      canvasHost.clipsToBounds = true
      view.addSubview(topbar)
      let pencil = UIPencilInteraction()
      pencil.delegate = self
      canvas.addInteraction(pencil)
      let hold = UILongPressGestureRecognizer(target: self, action: #selector(pencilHeld(_:)))
      hold.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.pencil.rawValue)]
      hold.minimumPressDuration = 0.55
      hold.allowableMovement = 5
      // The explicit menu action cancels its own stroke. Do not let recognition
      // also send a delayed cancellation into a later Pencil sequence.
      hold.cancelsTouchesInView = false
      canvas.addGestureRecognizer(hold)
      selectionLayer.fillColor = UIColor.clear.cgColor
      selectionLayer.strokeColor = UIColor.noteAccent.cgColor
      tapeOverlay.isUserInteractionEnabled = false
      canvas.addSubview(tapeOverlay)
      selectionLayer.lineWidth = 1.5
      selectionLayer.lineDashPattern = [5, 4]
      canvas.layer.addSublayer(selectionLayer)
      selectionHandles.fillColor = UIColor.notePanel.cgColor
      selectionHandles.strokeColor = UIColor.noteAccent.cgColor
      selectionHandles.lineWidth = 1.5
      canvas.layer.addSublayer(selectionHandles)
      guideLayer.fillColor = UIColor.clear.cgColor
      guideLayer.strokeColor = UIColor.noteAccent.cgColor
      guideLayer.lineWidth = 1
      canvas.layer.addSublayer(guideLayer)
      guideLabels.isUserInteractionEnabled = false
      canvas.addSubview(guideLabels)
      topbar.addSubview(titleLabel)
      topbar.addSubview(statusLabel)
      titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
      titleLabel.adjustsFontForContentSizeCategory = true
      statusLabel.font = .systemFont(ofSize: 12)
      statusLabel.textColor = .secondaryLabel
      statusLabel.adjustsFontForContentSizeCategory = true
      tray.layer.cornerRadius = 32
      tray.layer.borderWidth = 0.5
      tray.layer.shadowColor = UIColor(noteHex: "#24324d").cgColor
      tray.layer.shadowOpacity = 0.12
      tray.layer.shadowRadius = 14
      tray.layer.shadowOffset = CGSize(width: 0, height: 4)
      tray.clipsToBounds = false
      tray.contentView.layer.cornerRadius = 32
      tray.subviews.first?.layer.cornerRadius = 32
      tray.subviews.first?.clipsToBounds = true
      tray.contentView.backgroundColor = UIColor.notePanel.withAlphaComponent(0.94)
      view.addSubview(tray)
      tray.contentView.addSubview(strip)
      strip.showsHorizontalScrollIndicator = false
      strip.alwaysBounceHorizontal = true
      strip.canCancelContentTouches = true
      strip.isDirectionalLockEnabled = true
      strip.isAccessibilityElement = false
      tray.contentView.addSubview(grip)
      grip.addSubview(gripMark)
      grip.accessibilityLabel = "移动画笔工具栏"
      grip.accessibilityHint = "拖动工具栏，双击复位"
      gripMark.backgroundColor = UIColor(noteHex: "#b5bbc7").withAlphaComponent(0.55)
      gripMark.layer.cornerRadius = 2
      let drag = UIPanGestureRecognizer(target: self, action: #selector(moveTray(_:)))
      grip.addGestureRecognizer(drag)
      let reset = UITapGestureRecognizer(target: self, action: #selector(resetTray))
      reset.numberOfTapsRequired = 2
      grip.addGestureRecognizer(reset)
      canvas.metal.isHidden = !gpuEnabled
      if gpuEnabled { gpuWorker = NativeGpuWorker(layer: canvas.metal.metalLayer) }
      canvas.world = { [weak self] p in
        guard let self, let v = self.inputViewport ?? self.state["viewport"] as? [String: Double]
        else { return p }
        self.inputViewport = v
        return CGPoint(
          x: (v["x"] ?? 0) + p.x / max(1, self.canvas.bounds.width) * (v["width"] ?? 595),
          y: (v["y"] ?? 0) + p.y / max(1, self.canvas.bounds.height) * (v["height"] ?? 842))
      }
      canvas.input = { [weak self] phase, token, stylus, samples in
        guard let self else { return }
        if phase == 0 { self.resumeNativeTiming() }
        if !self.applyingEraser {
          if phase == 3 { self.queuedEraser.removeAll() }
          else if phase != 1 { self.flushEraserInput() }
          if phase == 1 && !self.sampling && self.state["tool"] as? String == "eraser" {
            self.queuedEraser.append(contentsOf:samples)
            self.queuedEraserToken=token
            self.queuedEraserStylus=stylus
            return
          }
        }
        let isInk = !self.sampling && ["pen", "highlighter"].contains(self.state["tool"] as? String ?? "pen")
        if phase == 0 && isInk { self.inkID += 1; self.inkActive = true }
        if phase == 0 { self.nativeCameraGesture = self.state["tool"] as? String == "hand" }
        if phase >= 2 { self.nativeCameraGesture = false }
        if phase == 0 { self.samplingGesture = self.sampling }
        if self.samplingGesture {
          if phase == 0, let point = samples.first { self.sample(point) }
          if phase >= 2 {
            self.samplingGesture = false
            self.inputViewport = nil
          }
          return
        }
        let start = CACurrentMediaTime()
        // Capture the complete final stroke before committing removes Rust's live overlay.
        var code: UInt32 = 0
        if phase == 2 && isInk {
          code = samples.withUnsafeBufferPointer {
            cube_surface_input(self.surface, 1, token, stylus ? 1 : 0, $0.baseAddress, $0.count)
          }
          if code == 0 {
            self.captureInk()
            code = cube_surface_input(self.surface, 2, token, stylus ? 1 : 0, nil, 0)
          }
        } else {
          code = samples.withUnsafeBufferPointer {
            cube_surface_input(self.surface, phase, token, stylus ? 1 : 0, $0.baseAddress, $0.count)
          }
        }
        if phase >= 2 { self.inkActive = false }
        if phase == 3 || code != 0 {
          self.inkNeedsCapture = false
          self.cancelledInk.insert(self.inkID)
          self.canvas.removeInk(self.inkID)
          self.pendingInk.removeAll { pending in
            guard pending.id == self.inkID else { return false }
            cube_surface_frame_free(pending.frame)
            return true
          }
        } else if phase < 2 && isInk { self.inkNeedsCapture = true }
        if code != 0 {
          self.inkActive = false
          self.nativeCameraGesture = false
          let message = self.surfaceError()
          self.inputViewport = nil
          if phase != 3 { _ = cube_surface_input(self.surface, 3, token, stylus ? 1 : 0, nil, 0) }
          self.canvas.abandonInput()
          self.needsFrame = true
          self.refresh()
          if phase != 3 { self.showError(message) }
          return
        }
        let elapsed = (CACurrentMediaTime() - start) * 1000
        _ = cube_surface_metric(self.surface, 0, elapsed)
        if phase < 3 { _ = cube_surface_metric(self.surface, 8 + phase, elapsed) }
        if elapsed > 8 {
          self.log.notice(
            "Rust input batch took \(elapsed, privacy: .public) ms; phase \(phase, privacy: .public)"
          )
        }
        self.needsFrame = true
        if phase >= 2 { self.inputViewport = nil }
        if phase >= 2 || !["pen", "highlighter"].contains(self.state["tool"] as? String ?? "pen") {
          self.refresh()
        }
        if phase == 2 && self.state["pendingText"] as? Bool == true { self.insertText() }
      }
      pan = UIPanGestureRecognizer(target: self, action: #selector(cameraChanged(_:)))
      pan.minimumNumberOfTouches = 2
      pan.maximumNumberOfTouches = 2
      pan.delegate = self
      pinch = UIPinchGestureRecognizer(target: self, action: #selector(cameraChanged(_:)))
      pinch.delegate = self
      pan.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
      pinch.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
      canvas.addGestureRecognizer(pan)
      canvas.addGestureRecognizer(pinch)
      buildSelectionToolbar()
      displayLink = CADisplayLink(
        target: NativeFrameTick(self), selector: #selector(NativeFrameTick.tick))
      displayLink?.add(to: .main, forMode: .common)

    }
    deinit {
      displayLink?.invalidate()
      for pending in pendingInk { cube_surface_frame_free(pending.frame) }
    }
    override func viewDidDisappear(_ animated: Bool) {
      super.viewDidDisappear(animated)
      displayLink?.isPaused = true
      lastFrameTick = 0
    }
    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      resumeNativeTiming()
    }
    override func didReceiveMemoryWarning() {
      super.didReceiveMemoryWarning()
      if gpuEnabled {gpuWorker?.trim();needsFrame=true}
      let renderer = pixelRenderer
      renderQueue.async { cube_surface_renderer_trim(renderer.handle) }
      thumbnailCache.removeAll()
      selectionCache = nil
      selectionCacheKey = nil
      let selectionWorker = selectionRenderer
      selectionQueue.async { cube_surface_renderer_trim(selectionWorker.handle) }
      let inkWorker = inkRenderer
      inkQueue.async { cube_surface_renderer_trim(inkWorker.handle) }
    }
    override func viewDidLayoutSubviews() {
      super.viewDidLayoutSubviews()
      let size = view.safeAreaLayoutGuide.layoutFrame.size
      guard size.width > 0, size.height > 0, size != lastLayout else { return }
      lastLayout = size
      refresh()
      _ = request([
        "op": "resize", "canvasWidth": canvas.bounds.width, "canvasHeight": canvas.bounds.height,
      ])
      renderGeneration += 1
      needsFrame = true
    }
    private func frame(_ item: [String: Any]) -> CGRect {
      let offset = view.safeAreaLayoutGuide.layoutFrame.origin
      return CGRect(
        x: offset.x + ((item["x"] as? NSNumber)?.doubleValue ?? 0),
        y: offset.y + ((item["y"] as? NSNumber)?.doubleValue ?? 0),
        width: (item["width"] as? NSNumber)?.doubleValue ?? 0,
        height: (item["height"] as? NSNumber)?.doubleValue ?? 0)
    }
    @discardableResult private func request(_ command: [String: Any]) -> Bool {
      if !applyingEraser && command["op"] as? String != "state" { flushEraserInput() }
      let start = CACurrentMediaTime()
      defer { _ = cube_surface_metric(surface, 5, (CACurrentMediaTime() - start) * 1000) }
      var command = command
      command["layoutWidth"] = max(1, lastLayout.width)
      command["layoutHeight"] = max(1, lastLayout.height)
      guard let data = try? JSONSerialization.data(withJSONObject: command) else { return false }
      let code = data.withUnsafeBytes {
        cube_surface_request(surface, $0.bindMemory(to: UInt8.self).baseAddress, $0.count)
      }
      guard code == 0 else {
        showError(surfaceError())
        return false
      }
      let output = Data(
        bytes: cube_surface_output_ptr(surface), count: cube_surface_output_len(surface))
      guard let next = (try? JSONSerialization.jsonObject(with: output)) as? [String: Any] else {
        return false
      }
      if state["documentEpoch"] != nil && (state["documentEpoch"] as? UInt64 != next["documentEpoch"] as? UInt64
        || state["pageIndex"] as? Int != next["pageIndex"] as? Int) {
        documentGeneration += 1
        resetInkPublication()
        renderGeneration += 1
      }
      if state["viewport"] as? [String: Double] != next["viewport"] as? [String: Double]
        || state["revision"] as? UInt64 != next["revision"] as? UInt64 {
        renderGeneration += 1
      }
      state = next
      if next["dirty"] as? Bool == true { scheduleAutosave() }
      return true
    }
    private func localFrame(_ item: [String: Any]) -> CGRect {
      CGRect(
        x: (item["x"] as? NSNumber)?.doubleValue ?? 0,
        y: (item["y"] as? NSNumber)?.doubleValue ?? 0,
        width: (item["width"] as? NSNumber)?.doubleValue ?? 0,
        height: (item["height"] as? NSNumber)?.doubleValue ?? 0)
    }
    private func image(_ bytes: Data, width: Int, height: Int, scale: CGFloat) -> UIImage? {
      guard bytes.count == width * height * 4, let provider = CGDataProvider(data: bytes as CFData),
        let image = CGImage(
          width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
          bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
          provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
      else { return nil }
      return UIImage(cgImage: image, scale: scale, orientation: .up)
    }
    private func toolImage(_ item: [String: Any]) -> UIImage? {
      let scale = min(3, view.window?.screen.scale ?? 2)
      let glyphHeight: CGFloat = (item["height"] as? Double ?? 86) < 80 ? 56 : 82
      let key = "\(item["glyph"] ?? "")/\(item["color"] ?? "")/\(glyphHeight)/\(scale)"
      if let cached = toolImages[key] { return cached }
      let width = UInt32(40 * scale)
      let height = UInt32(glyphHeight * scale)
      guard cube_surface_tool_icon(surface, UInt32(item["action"] as? Int ?? 0), width, height) == 0
      else { return nil }
      let data = Data(
        bytes: cube_surface_output_ptr(surface), count: cube_surface_output_len(surface))
      let result = image(data, width: Int(width), height: Int(height), scale: scale)
      if toolImages.count > 80 { toolImages.removeAll() }
      toolImages[key] = result
      return result
    }
    private func refresh() {
      let startedAt = CACurrentMediaTime()
      defer { _ = cube_surface_metric(surface, 11, (CACurrentMediaTime() - startedAt) * 1000) }
      guard request(["op": "state"]) else { return }
      titleLabel.text = embeddedName ?? state["title"] as? String
      statusLabel.text = sampling ? "轻点画布取色" : state["status"] as? String
      if !sampling && saveURL != nil && state["dirty"] as? Bool == false {
        statusLabel.text = "已保存到文件"
      }
      if let rect = state["topbar"] as? [String: Any] { topbar.frame = frame(rect) }
      if let rect = state["titleFrame"] as? [String: Any] { titleLabel.frame = localFrame(rect) }
      if let rect = state["statusFrame"] as? [String: Any] { statusLabel.frame = localFrame(rect) }
      if let rect = state["body"] as? [String: Any] {
        canvasHost.frame = frame(rect)
        let rotation = state["rotation"] as? Int ?? 0
        let size = canvasHost.bounds.size
        canvas.transform = .identity
        canvas.bounds = CGRect(
          origin: .zero,
          size: rotation % 2 == 0 ? size : CGSize(width: size.height, height: size.width))
        canvas.center = CGPoint(x: size.width / 2, y: size.height / 2)
        canvas.transform = CGAffineTransform(rotationAngle: CGFloat(rotation) * .pi / 2)
      }
      topbar.backgroundColor =
        traitCollection.userInterfaceStyle == .dark
        ? .secondarySystemBackground : UIColor(noteHex: "#f7f8fc")
      topbar.layer.shadowColor = UIColor.separator.cgColor
      topbar.layer.shadowOpacity = 0.3
      topbar.layer.shadowOffset = CGSize(width: 0, height: 0.5)
      topbar.layer.shadowRadius = 0
      updateSelection()
      updateTapeOverlay()
      updateCameraPreview()
      let readonly = state["readonly"] as? Bool ?? false
      canvas.drawingEnabled = sampling || !readonly || state["tool"] as? String == "hand"
      canvas.acceptFinger = state["fingerDraw"] as? Bool ?? true
      pan.minimumNumberOfTouches = readonly || !canvas.acceptFinger ? 1 : 2
      tray.isHidden = readonly
      if let rect = state["tray"] as? [String: Any] { tray.frame = frame(rect) }
      tray.layer.borderColor = UIColor.separator.withAlphaComponent(0.3).cgColor
      if let rect = state["strip"] as? [String: Any] {
        strip.frame = localFrame(rect)
        strip.contentSize = CGSize(
          width: rect["contentWidth"] as? Double ?? 460, height: strip.bounds.height)
      }
      if let rect = state["grip"] as? [String: Any] {
        grip.frame = localFrame(rect)
        gripMark.frame = CGRect(x: (grip.bounds.width - 40) / 2, y: 20, width: 40, height: 4)
      }
      let items =
        (state["topControls"] as? [[String: Any]] ?? [])
        + (state["controls"] as? [[String: Any]] ?? [])
        + (state["buttons"] as? [[String: Any]] ?? [])
      for item in items {
        let id = item["action"] as? Int ?? 0
        let group = item["group"] as? String ?? ""
        let button: UIButton
        if let existing = buttons[id] {
          button = existing
        } else {
          button =
            id < 13
            ? NativeToolButton(frame: .zero)
            : (["swatch", "color"].contains(group)
              ? NativeSwatchButton(type: .custom) : UIButton(type: .system))
          button.tag = id
          button.isAccessibilityElement = true
          button.accessibilityIdentifier = "rust-action-\(id)"
          button.addTarget(self, action: #selector(action(_:)), for: .touchUpInside)
          buttons[id] = button
        }
        let parent: UIView = id < 13 ? strip : (id >= 203 && id <= 206 ? topbar : tray.contentView)
        if button.superview !== parent { parent.addSubview(button) }
        button.frame = localFrame(item)
        button.accessibilityLabel = item["title"] as? String
        button.isEnabled = item["enabled"] as? Bool ?? true
        button.isSelected = item["selected"] as? Bool ?? false
        button.alpha = button.isEnabled ? 1 : 0.3
        if let pen = button as? NativeToolButton {
          pen.configure(item, image: toolImage(item))
          continue
        }
        if let swatch = button as? NativeSwatchButton {
          swatch.swatch = UIColor(noteHex: item["color"] as? String ?? "#222b40")
          swatch.rainbow = item["rainbow"] as? Bool ?? false
          swatch.ring = button.isSelected || (group == "color" && !swatch.rainbow)
          swatch.accessibilityTraits = button.isSelected ? [.button, .selected] : [.button]
          continue
        }
        button.tintColor = id >= 203 && id <= 206 ? UIColor(noteHex: "#594ee1") : UIColor.noteText
        button.setImage(chromeImage(id), for: .normal)
        button.setTitle(item["label"] as? String, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
        button.layer.cornerRadius = group == "history" ? 22 : 14
        button.backgroundColor = group == "history" ? UIColor.noteHover : .clear
        if group == "mode" {
          button.backgroundColor = UIColor(noteHex: "#594ee1")
          button.tintColor = .white
          button.setTitleColor(.white, for: .normal)
          button.imageEdgeInsets = UIEdgeInsets(top: 0, left: -6, bottom: 0, right: 0)
        }
        if id == 206 {
          button.menu = nil
          button.showsMenuAsPrimaryAction = false
        }
      }
    }
    private func thumbnail(_ index: Int, completion: @escaping (UIImage?) -> Void) {
      let key = "\(state["documentEpoch"] ?? 0)/\(state["revision"] ?? 0)/\(index)"
      if let image = thumbnailCache[key] {
        completion(image)
        return
      }
      guard let frame = cube_surface_page_frame(surface, index) else {
        completion(nil)
        return
      }
      let renderer = pixelRenderer
      let aspect = cube_surface_frame_aspect(frame)
      let pixelWidth = UInt32(min(512, max(16, 268 * aspect)))
      let pixelHeight = UInt32(min(512, max(16, Double(pixelWidth) / aspect)))
      renderQueue.async { [weak self] in
        defer { cube_surface_frame_free(frame) }
        renderer.prepareFonts(for: frame)
        let code = cube_surface_render(renderer.handle, frame, pixelWidth, pixelHeight)
        let data = Data(
          bytes: cube_surface_renderer_output_ptr(renderer.handle),
          count: cube_surface_renderer_output_len(renderer.handle))
        DispatchQueue.main.async {
          guard let self else { return }
          let image =
            code == 0
            ? self.image(data, width: Int(pixelWidth), height: Int(pixelHeight), scale: 2) : nil
          if self.thumbnailCache.count > 60 { self.thumbnailCache.removeAll() }
          self.thumbnailCache[key] = image
          completion(image)
        }
      }
    }
    private func buildSelectionToolbar() {
      func width(_ view: UIView,_ value: CGFloat) {
        let constraint = view.widthAnchor.constraint(equalToConstant:value)
        // Hidden arranged items receive a zero-width constraint from UIStackView.
        constraint.priority = UILayoutPriority(999)
        constraint.isActive = true
      }
      selectionToolbar.axis = .horizontal
      selectionToolbar.alignment = .center
      selectionToolbar.spacing = 4
      selectionToolbar.layoutMargins = UIEdgeInsets(top: 4, left: 8, bottom: 4, right: 8)
      selectionToolbar.isLayoutMarginsRelativeArrangement = true
      selectionToolbar.backgroundColor = .notePanel
      selectionToolbar.layer.cornerRadius = 28
      selectionToolbar.layer.borderWidth = 1
      selectionToolbar.layer.shadowColor = UIColor(noteHex: "#24324d").cgColor
      selectionToolbar.layer.shadowOpacity = 0.09
      selectionToolbar.layer.shadowRadius = 12
      selectionToolbar.layer.shadowOffset = CGSize(width: 0, height: 4)
      selectionToolbar.accessibilityIdentifier = "native-selection-toolbar"
      selectionToolbar.accessibilityLabel = "选中内容"
      selectionCount.font = .systemFont(ofSize: 12)
      selectionCount.textColor = .noteMuted
      selectionCount.textAlignment = .center
      width(selectionCount,24)
      selectionToolbar.addArrangedSubview(selectionCount)
      for index in 0..<3 {
        let swatch = NativeSwatchButton(type: .custom)
        width(swatch,36)
        swatch.heightAnchor.constraint(equalToConstant: 44).isActive = true
        swatch.circleDiameter = 22
        swatch.tag = 20+index
        swatch.addTarget(self,action:#selector(selectionAction(_:)),for:.touchUpInside)
        selectionSwatches.append(swatch)
        selectionToolbar.addArrangedSubview(swatch)
      }
      selectionDivider.backgroundColor = .noteBorder
      width(selectionDivider,1)
      selectionDivider.heightAnchor.constraint(equalToConstant: 26).isActive = true
      selectionToolbar.addArrangedSubview(selectionDivider)
      for (tag,title,icon,id) in [
        (2,"笔迹颜色",210,"color"),
        (3,"排列选中内容",216,"arrange"),
        (4,"添加连接形状",217,"connect"),
        (5,"编辑文字",218,"text"),
        (6,"保存区域",219,"scene"),
        (0,"复制选中内容",214,"duplicate"),
        (1,"删除选中内容",215,"delete")
      ] {
        let button: UIButton = tag == 2 ? NativeSwatchButton(type: .custom) : UIButton(type: .system)
        if tag != 2 {
          if let source = chromeImage(icon) {
            let glyph = UIGraphicsImageRenderer(size:CGSize(width:20,height:20)).image { _ in
              source.draw(in:CGRect(x:0,y:0,width:20,height:20))
            }.withRenderingMode(.alwaysTemplate)
            button.setImage(glyph,for:.normal)
          }
          button.tintColor = .noteText
        } else {
          (button as? NativeSwatchButton)?.circleDiameter = 22
        }
        width(button,44)
        button.heightAnchor.constraint(equalToConstant:44).isActive = true
        button.layer.cornerRadius = 12
        button.tag = tag
        button.accessibilityIdentifier = "native-selection-"+id
        button.accessibilityLabel = title
        button.addTarget(self,action:#selector(selectionAction(_:)),for:.touchUpInside)
        selectionActions[tag] = button
        selectionToolbar.addArrangedSubview(button)
      }
      selectionToolbar.isHidden = true
      view.addSubview(selectionToolbar)
    }
    @objc private func selectionAction(_ button: UIButton) {
      canvas.cancelInput()
      switch button.tag {
      case 2,3: showPanel("selection"); return
      case 5: editSelectionText(); return
      case 6: saveSelectionScene(); return
      default: break
      }
      let command: [String:Any]
      if button.tag >= 20 {
        let colors = selectionQuickColors
        command = ["op":"color","color":colors[min(button.tag-20,2)]]
      } else {
        command = ["op":"selection","action":button.tag == 4 ? "connect" : button.tag == 1 ? "delete" : "duplicate"]
      }
      if request(command) { refresh(); needsFrame = true }
    }
    private var selectionQuickColors: [String] {
      let color = state["color"] as? String ?? "#222b40"
      var colors = ["#222b40","#4f46e5","#2563eb"]
      if !colors.contains(color) { colors[2] = color }
      return colors
    }
    private func editSelectionText() {
      guard let text = state["selectionText"] as? String else { return }
      let alert = UIAlertController(title:"编辑文字",message:nil,preferredStyle:.alert)
      alert.addTextField { $0.text = text; $0.placeholder = "输入文字" }
      alert.addAction(UIAlertAction(title:"取消",style:.cancel))
      alert.addAction(UIAlertAction(title:"保存",style:.default) { [weak self,weak alert] _ in
        guard let self, let text = alert?.textFields?.first?.text, !text.isEmpty else { return }
        if self.request(["op":"change","kind":"selectionText","text":text]) { self.refresh(); self.needsFrame = true }
      })
      present(alert,animated:!UIAccessibility.isReduceMotionEnabled)
    }
    private func saveSelectionScene() {
      let alert = UIAlertController(title:"保存区域",message:"保存选中区域，随时跳回。",preferredStyle:.alert)
      let count = state["sceneCount"] as? Int ?? 0
      alert.addTextField { $0.text = "区域 \(count+1)"; $0.placeholder = "区域名称" }
      alert.addAction(UIAlertAction(title:"取消",style:.cancel))
      alert.addAction(UIAlertAction(title:"保存",style:.default) { [weak self,weak alert] _ in
        guard let self, let text = alert?.textFields?.first?.text?.trimmingCharacters(in:.whitespacesAndNewlines), !text.isEmpty else { return }
        if self.request(["op":"scene","name":String(text.prefix(256))]) { self.refresh(); self.needsFrame = true }
      })
      present(alert,animated:!UIAccessibility.isReduceMotionEnabled)
    }
    private func updateSelectionPresentation() {
      let moving = selectionManipulating
      if moving && !wasSelectionManipulating { renderGeneration += 1 }
      wasSelectionManipulating = moving
      guard state["readonly"] as? Bool != true,
        state["tool"] as? String == "lasso", let selected = state["selection"] as? [String:Double],
        let ids = state["selectionIDs"] as? [String], !ids.isEmpty,
        let viewport = state["viewport"] as? [String:Double] else {
        selectionToolbar.isHidden = true
        selectionCache = nil
        selectionCacheKey = nil
        return
      }
      if !gpuEnabled { canvas.moveSelectionPreview(to: selected) }
      selectionToolbar.isHidden = moving || canvas.hasActiveInput
      // Restore the original mobile capsule above the pen tray, with compact
      // icon-only actions on phone / portrait mini and quick colors on wide iPad.
      let compact = view.bounds.width <= 760
      selectionCount.text = String(ids.count)
      selectionCount.isHidden = compact
      selectionDivider.isHidden = compact
      selectionToolbar.layer.borderColor = UIColor.noteBorder.cgColor
      for (index,swatch) in selectionSwatches.enumerated() {
        let color = selectionQuickColors[index]
        swatch.swatch = UIColor(noteHex:color)
        swatch.ring = color == (state["color"] as? String ?? "")
        swatch.accessibilityLabel = "笔迹颜色 \(color)"
        swatch.isHidden = compact
      }
      (selectionActions[2] as? NativeSwatchButton)?.swatch = UIColor(noteHex:state["color"] as? String ?? "#222b40")
      selectionActions[2]?.isHidden = !compact
      selectionActions[4]?.isHidden = state["selectionConnectable"] as? Bool != true
      selectionActions[5]?.isHidden = !(state["selectionText"] is String)
      let size = selectionToolbar.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
      let safe = view.safeAreaLayoutGuide.layoutFrame
      let menuWidth = min(size.width,max(1,safe.width-16))
      let trayTop = (state["tray"] as? [String:Any]).map { frame($0).minY } ?? tray.frame.minY
      selectionToolbar.frame = CGRect(x:safe.midX-menuWidth/2,
        y:max(safe.minY+76,trayTop-size.height-10),width:menuWidth,height:size.height)
      if cameraBase != nil || nativeCameraGesture {
        selectionToolbar.isHidden = true
        return
      }
      // The GPU consumes Rust's immutable selection preview directly, including
      // its updated position; no CPU background/foreground patch is needed.
      if gpuEnabled { return }
      let key = "\(documentGeneration):\(state["revision"] as? UInt64 ?? 0):\(ids.joined(separator: ":")):" +
        ["x","y","width","height"].map { String(viewport[$0] ?? 0) }.joined(separator: ":")
      if key != selectionCacheKey {
        selectionCacheKey = key
        selectionCache = nil
        prepareSelectionPresentation(key: key, viewport: viewport,
          origin: state["selectionOrigin"] as? [String:Double] ?? selected)
      }
      if moving, let cache = selectionCache, !canvas.selectionPreviewVisible {
        canvas.showSelectionPreview(background: cache.background, foreground: cache.foreground,
          source: cache.viewport, origin: cache.origin, current: selected)
      }
    }
    private func prepareSelectionPresentation(key: String, viewport: [String:Double], origin: [String:Double]) {
      guard canvas.bounds.width > 0, canvas.bounds.height > 0,
        let background = cube_surface_selection_frame(surface, 0) else { selectionCacheKey = nil; return }
      guard let foreground = cube_surface_selection_frame(surface, 1) else {
        cube_surface_frame_free(background); selectionCacheKey = nil; return
      }
      let b = cube_surface_frame_bounds(foreground)
      let source = ["x":b.x,"y":b.y,"width":b.width,"height":b.height]
      let scale = min(2, view.window?.screen.scale ?? 2)
      let w = b.width/(viewport["width"] ?? 1)*canvas.bounds.width*scale
      let h = b.height/(viewport["height"] ?? 1)*canvas.bounds.height*scale
      let ratio = min(1,sqrt(8_000_000/max(1,w*h)),4096/max(1,w,h))
      let width = UInt32(max(1,(w*ratio).rounded(.up)))
      let height = UInt32(max(1,(h*ratio).rounded(.up)))
      let renderer = selectionRenderer
      selectionQueue.async { [weak self] in
        defer { cube_surface_frame_free(background); cube_surface_frame_free(foreground) }
        let start = CACurrentMediaTime()
        renderer.prepareFonts(for: background)
        renderer.prepareFonts(for: foreground)
        let backCode = cube_surface_render(renderer.handle,background,width,height)
        let back = Data(bytes:cube_surface_renderer_output_ptr(renderer.handle),count:cube_surface_renderer_output_len(renderer.handle))
        let frontCode = cube_surface_render(renderer.handle,foreground,width,height)
        let front = Data(bytes:cube_surface_renderer_output_ptr(renderer.handle),count:cube_surface_renderer_output_len(renderer.handle))
        DispatchQueue.main.async {
          guard let self, self.selectionCacheKey == key, backCode == 0, frontCode == 0,
            let bg = self.image(back,width:Int(width),height:Int(height),scale:1),
            let fg = self.image(front,width:Int(width),height:Int(height),scale:1) else { return }
          self.selectionCache = SelectionCache(background:bg,foreground:fg,viewport:source,origin:origin)
          self.selectionPreparationMs = (CACurrentMediaTime()-start)*1000
          self.updateSelectionPresentation()
        }
      }
    }
    private func updateSelection() {
      let path = UIBezierPath()
      let handles = UIBezierPath()
      func screen(_ x: Double, _ y: Double) -> CGPoint {
        let v = state["viewport"] as? [String: Double] ?? [:]
        return CGPoint(
          x: (x - (v["x"] ?? 0)) / (v["width"] ?? 1) * canvas.bounds.width,
          y: (y - (v["y"] ?? 0)) / (v["height"] ?? 1) * canvas.bounds.height)
      }
      if let b = state["selection"] as? [String: Double] {
        let a = screen(b["x"] ?? 0, b["y"] ?? 0)
        let z = screen((b["x"] ?? 0) + (b["width"] ?? 0), (b["y"] ?? 0) + (b["height"] ?? 0))
        path.append(UIBezierPath(rect: CGRect(x: a.x, y: a.y, width: z.x - a.x, height: z.y - a.y)))
        for p in [a, z, CGPoint(x: a.x, y: z.y), CGPoint(x: z.x, y: a.y)] {
          handles.append(
            UIBezierPath(
              roundedRect: CGRect(x: p.x - 4, y: p.y - 4, width: 8, height: 8), cornerRadius: 2))
        }
      }
      for (i, p) in (state["lassoPath"] as? [[String: Double]] ?? []).enumerated() {
        let q = screen(p["x"] ?? 0, p["y"] ?? 0)
        if i == 0 { path.move(to: q) } else { path.addLine(to: q) }
      }
      selectionLayer.frame = canvas.bounds
      selectionLayer.path = path.cgPath
      selectionHandles.frame = canvas.bounds
      selectionHandles.path = handles.cgPath
      updateSelectionPresentation()
      let guides = UIBezierPath()
      guideLabels.frame = canvas.bounds
      guideLabels.subviews.forEach { $0.removeFromSuperview() }
      for guide in state["guides"] as? [[String: Any]] ?? [] {
        let vertical = guide["axis"] as? String == "x"
        let position = guide["position"] as? Double ?? 0
        let start = guide["start"] as? Double ?? 0
        let end = guide["end"] as? Double ?? 0
        let a = vertical ? screen(position, start) : screen(start, position)
        let b = vertical ? screen(position, end) : screen(end, position)
        guides.move(to: a)
        guides.addLine(to: b)
        if let text = guide["label"] as? String {
          let label = UILabel(
            frame: CGRect(x: (a.x + b.x) / 2 - 35, y: (a.y + b.y) / 2 - 24, width: 70, height: 20))
          label.text = text
          label.textColor = .noteAccent
          label.backgroundColor = .notePanel
          label.textAlignment = .center
          label.font = .systemFont(ofSize: 11, weight: .medium)
          label.layer.cornerRadius = 5
          label.clipsToBounds = true
          guideLabels.addSubview(label)
        }
      }
      guideLayer.frame = canvas.bounds
      guideLayer.path = guides.cgPath
    }
    private func updateTapeOverlay() {
      tapeOverlay.frame = canvas.bounds
      tapeOverlay.subviews.forEach { $0.removeFromSuperview() }
      let v = state["viewport"] as? [String: Double] ?? [:]
      let sx = canvas.bounds.width / (v["width"] ?? 1)
      let sy = canvas.bounds.height / (v["height"] ?? 1)
      let editing = state["tool"] as? String == "tape" && state["readonly"] as? Bool != true
      for t in state["tapes"] as? [[String: Any]] ?? [] {
        let x = t["x"] as? Double ?? 0
        let y = t["y"] as? Double ?? 0
        let w = (t["width"] as? Double ?? 0) * sx
        let h = (t["height"] as? Double ?? 0) * sy
        let paper = UIView(frame: CGRect(x: 0, y: 0, width: w, height: h))
        paper.center = CGPoint(x: (x - (v["x"] ?? 0)) * sx, y: (y - (v["y"] ?? 0)) * sy)
        paper.backgroundColor = UIColor(noteHex: "#f5e5b6").withAlphaComponent(0.52)
        paper.layer.borderColor = UIColor(noteHex: "#c2a875").withAlphaComponent(0.4).cgColor
        paper.layer.borderWidth = 1
        paper.transform = CGAffineTransform(rotationAngle: (t["angle"] as? Double ?? 0) * .pi / 180)
        tapeOverlay.addSubview(paper)
        if editing {
          for point in [
            CGPoint(x: 0, y: h / 2), CGPoint(x: w, y: h / 2), CGPoint(x: w / 2, y: h + 32 * sy),
          ] {
            let handle = UILabel(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
            handle.center = point
            handle.backgroundColor = .notePanel
            handle.textColor = .noteAccent
            handle.textAlignment = .center
            handle.font = .systemFont(ofSize: 22)
            handle.text = point.y > h ? "↻" : "│"
            handle.layer.cornerRadius = 22
            handle.clipsToBounds = true
            paper.addSubview(handle)
          }
        }
      }
      if state["tool"] as? String == "background", let b = state["background"] as? [String: Any] {
        let w = (b["width"] as? Double ?? 0) * sx
        let h = (b["height"] as? Double ?? 0) * sy
        let outline = UIView(frame: CGRect(x: 0, y: 0, width: w, height: h))
        outline.center = CGPoint(
          x: ((b["x"] as? Double ?? 0) + (b["width"] as? Double ?? 0) / 2 - (v["x"] ?? 0)) * sx,
          y: ((b["y"] as? Double ?? 0) + (b["height"] as? Double ?? 0) / 2 - (v["y"] ?? 0)) * sy)
        outline.layer.borderColor = UIColor.noteAccent.cgColor
        outline.layer.borderWidth = 2
        outline.transform = CGAffineTransform(
          rotationAngle: (b["angle"] as? Double ?? 0) * .pi / 180)
        tapeOverlay.addSubview(outline)
      }
    }
    private func insertText() {
      let alert = UIAlertController(title: "文字", message: nil, preferredStyle: .alert)
      alert.addTextField { $0.placeholder = "输入文字" }
      alert.addAction(
        UIAlertAction(title: "取消", style: .cancel) { [weak self] _ in
          _ = self?.request(["op": "tool", "tool": "pen"])
        })
      alert.addAction(
        UIAlertAction(title: "插入", style: .default) { [weak self, weak alert] _ in
          guard let self, let text = alert?.textFields?.first?.text, !text.isEmpty else { return }
          if self.request(["op": "insertText", "text": text]) {
            self.refresh()
            self.needsFrame = true
          }
        })
      present(alert, animated: true)
    }
    private func showTools() { showPanel("tools") }
    private func showPanel(_ name: String, anchor: CGPoint? = nil) {
      canvas.cancelInput()
      var command: [String: Any] = ["op": "panel", "name": name]
      if let anchor {
        let origin = view.safeAreaLayoutGuide.layoutFrame.origin
        command["anchorX"] = anchor.x - origin.x
        command["anchorY"] = anchor.y - origin.y
      }
      guard request(command) else { return }
      let controller = NativeActionPanel(
        state: state, icon: { [weak self] action in self?.chromeImage(action) },
        run: { [weak self] value in
          guard let self, self.request(value) else { return nil }
          self.refresh()
          self.needsFrame = true
          // refresh requests fresh chrome; preserve the requested panel projection for this card.
          var value = value
          if value["op"] as? String != "panel", value["panelName"] == nil {
            value["panelName"] = name
          }
          _ = self.request([
            "op": "panel",
            "name": value["name"] as? String ?? value["panelName"] as? String ?? name,
          ])
          return self.state
        }, host: { [weak self] value in self?.performHost(value) })
      present(controller, animated: !UIAccessibility.isReduceMotionEnabled)
    }
    private func performHost(_ value: [String: Any]) {
      switch value["host"] as? String ?? "" {
      case "save": save()
      case "open":
        if embeddedClosed != nil { finishEmbedded() } else { openNotebook() }
      case "rotate":
        canvas.cancelInput()
        _ = request(["op": "rotate"])
        refresh()
        matchAspect()
        needsFrame = true
      case "finger":
        _ = request(["op": "fingerDraw", "value": !(state["fingerDraw"] as? Bool ?? true)])
        refresh()
      case "photo": choosePhoto()
      case "exportPNG": exportPages(pdf: false)
      case "exportPDF": exportPages(pdf: true)
      case "sample", "sampleBackground":
        sampling = true
        sampleBackground = value["host"] as? String == "sampleBackground"
        statusLabel.text = "轻点画布取色"
        refresh()
      case "ink":
        if !["pen", "highlighter", "eraser"].contains(state["tool"] as? String ?? "") {
          _ = request(["op": "tool", "tool": "pen"])
          refresh()
        }
        if let selected = (state["buttons"] as? [[String: Any]])?.first(where: {
          $0["selected"] as? Bool == true
        }), let id = selected["action"] as? Int, let button = buttons[id] {
          action(button)
        }
      case "colors": showPanel("colors")
      case "colorPicker": presentColorPicker()
      default: break
      }
    }
    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
      !canvas.hasPencilInput
    }
    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
      canvas.cancelInput()
      _ = request(["op": "tool", "tool": state["tool"] as? String == "eraser" ? "pen" : "eraser"])
      refresh()
      needsFrame = true
    }
    @objc private func pencilHeld(_ gesture: UILongPressGestureRecognizer) {
      if gesture.state == .began && state["readonly"] as? Bool != true {
        canvas.cancelInput()
        showPanel("tip", anchor: gesture.location(in: view))
      }
    }
    func photoDestination(background: Bool) -> PhotoDestination {
      PhotoDestination(background: background,
        documentEpoch: state["documentEpoch"] as? UInt64 ?? 0,
        pageIndex: state["pageIndex"] as? Int ?? 0)
    }
    /// A new system panel can only be presented after the previous one finishes
    /// dismissing. UIAlertAction handlers run before that transition completes.
    func dismissPhotoPanel(_ panel: UIViewController, then completion: @escaping () -> Void) {
      if panel.isBeingDismissed, let transition = panel.transitionCoordinator {
        transition.animate(alongsideTransition: nil) { _ in completion() }
      } else if panel.presentingViewController != nil {
        panel.dismiss(animated: !UIAccessibility.isReduceMotionEnabled, completion: completion)
      } else {
        completion()
      }
    }
    private func anchorPhotoMenu(_ menu: UIAlertController) {
      let anchor = buttons[202] ?? view!
      menu.popoverPresentationController?.sourceView = anchor
      menu.popoverPresentationController?.sourceRect = buttons[202]?.bounds
        ?? CGRect(x: anchor.bounds.midX, y: anchor.bounds.midY, width: 1, height: 1)
    }
    private func choosePhoto() {
      guard state["readonly"] as? Bool != true else { return }
      canvas.cancelInput()
      let menu = UIAlertController(title: "插入图片", message: nil, preferredStyle: .actionSheet)
      for (title, background) in [("作为普通内容", false), ("作为背景用于描摹", true)] {
        let destination = photoDestination(background: background)
        menu.addAction(
          UIAlertAction(title: title, style: .default) { [weak self, weak menu] _ in
            guard let self, let menu else { return }
            self.dismissPhotoPanel(menu) { [weak self] in self?.choosePhotoSource(destination) }
          })
      }
      menu.addAction(UIAlertAction(title: "取消", style: .cancel))
      anchorPhotoMenu(menu)
      present(menu, animated: true)
    }
    private func choosePhotoSource(_ destination: PhotoDestination) {
      let menu = UIAlertController(title: "图片来源", message: nil, preferredStyle: .actionSheet)
      menu.addAction(
        UIAlertAction(title: "选择照片", style: .default) { [weak self, weak menu] _ in
          guard let self, let menu else { return }
          self.dismissPhotoPanel(menu) { [weak self] in
            guard let self else { return }
            var config = PHPickerConfiguration()
            config.filter = .images
            config.selectionLimit = 1
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = self
            self.pendingPhoto = destination
            self.present(picker, animated: true)
          }
        })
      if UIImagePickerController.isSourceTypeAvailable(.camera) {
        menu.addAction(
          UIAlertAction(title: "拍照", style: .default) { [weak self, weak menu] _ in
            guard let self, let menu else { return }
            self.dismissPhotoPanel(menu) { [weak self] in
              guard let self else { return }
              let picker = UIImagePickerController()
              picker.sourceType = .camera
              picker.delegate = self
              self.pendingPhoto = destination
              self.present(picker, animated: true)
            }
          })
      }
      menu.addAction(UIAlertAction(title: "取消", style: .cancel))
      anchorPhotoMenu(menu)
      present(menu, animated: true)
    }
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
      let destination = pendingPhoto
      pendingPhoto = nil
      dismissPhotoPanel(picker) { [weak self] in
        guard let self, let destination, let provider = results.first?.itemProvider else { return }
        guard provider.canLoadObject(ofClass: UIImage.self) else {
          self.showError("无法读取这张图片，请重新选择照片。")
          return
        }
        provider.loadObject(ofClass: UIImage.self) { [weak self] object, error in
          DispatchQueue.main.async {
            guard let self else { return }
            guard let image = object as? UIImage else {
              self.showError(error?.localizedDescription ?? "无法读取这张图片，请重新选择照片。")
              return
            }
            self.importPhoto(image, destination: destination)
          }
        }
      }
    }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
      pendingPhoto = nil
      picker.dismiss(animated: true)
    }
    func imagePickerController(
      _ picker: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      let destination = pendingPhoto
      pendingPhoto = nil
      dismissPhotoPanel(picker) { [weak self] in
        guard let self, let destination else { return }
        guard let image = info[.originalImage] as? UIImage else {
          self.showError("无法读取拍摄的照片，请重试。")
          return
        }
        self.importPhoto(image, destination: destination)
      }
    }
    func importPhoto(_ image: UIImage, destination: PhotoDestination) {
      guard acceptsPhoto(destination) else { return }
      statusLabel.text = "正在插入图片…"
      saveQueue.async { [weak self] in
        let result = Result { try NativePhotoImport.encode(image) }
        DispatchQueue.main.async { [weak self] in
          guard let self, self.acceptsPhoto(destination) else { return }
          switch result {
          case .success(let payload):
            if self.request([
              "op": "change", "kind": "photo", "src": payload.source,
              "pixelWidth": payload.size.width, "pixelHeight": payload.size.height,
              "background": destination.background,
            ]) {
              self.refresh()
              self.needsFrame = true
            }
          case .failure(let error):
            self.refresh()
            self.showError(error.localizedDescription)
          }
        }
      }
    }
    private func acceptsPhoto(_ destination: PhotoDestination) -> Bool {
      destination.documentEpoch == state["documentEpoch"] as? UInt64
        && destination.pageIndex == state["pageIndex"] as? Int
        && state["readonly"] as? Bool != true
    }
    private func sample(_ point: InputSample) {
      let viewport = state["viewport"] as? [String: Double] ?? [:]
      func color(_ image: CGImage?) -> String? {
        guard let image, let data = image.dataProvider?.data, let bytes = CFDataGetBytePtr(data)
        else { return nil }
        let x = min(
          image.width - 1,
          max(
            0,
            Int((point.x - (viewport["x"] ?? 0)) / (viewport["width"] ?? 1) * Double(image.width))))
        let y = min(
          image.height - 1,
          max(
            0,
            Int((point.y - (viewport["y"] ?? 0)) / (viewport["height"] ?? 1) * Double(image.height))
          ))
        let offset = y * image.bytesPerRow + x * 4
        let alpha = max(1, Int(bytes[offset + 3]))
        return String(
          format: "#%02x%02x%02x", min(255, Int(bytes[offset]) * 255 / alpha),
          min(255, Int(bytes[offset + 1]) * 255 / alpha),
          min(255, Int(bytes[offset + 2]) * 255 / alpha))
      }
      func apply(_ hex: String?) {
        sampling = false
        guard let hex else { return }
        _ = request(["op": "color", "color": hex])
        refresh()
        needsFrame = true
      }
      guard
        let frame =
          (sampleBackground ? cube_surface_background_frame(surface) : cube_surface_frame(surface))
      else {
        sampling = false
        refresh()
        return
      }
      let renderer = pixelRenderer
      let epoch = state["documentEpoch"] as? UInt64
      renderQueue.async { [weak self] in
        defer { cube_surface_frame_free(frame) }
        renderer.prepareFonts(for: frame)
        let code = cube_surface_render(renderer.handle, frame, 744, 1000)
        let data = Data(
          bytes: cube_surface_renderer_output_ptr(renderer.handle),
          count: cube_surface_renderer_output_len(renderer.handle))
        DispatchQueue.main.async {
          guard let self, epoch == self.state["documentEpoch"] as? UInt64 else { return }
          apply(
            code == 0 ? color(self.image(data, width: 744, height: 1000, scale: 1)?.cgImage) : nil)
        }
      }
    }
    private func exportPages(pdf: Bool) {
      guard !exporting else { return }
      canvas.cancelInput()
      exporting = true
      let indices =
        pdf
        ? Array(0..<(state["pages"] as? [[String: Any]] ?? []).count)
        : [state["pageIndex"] as? Int ?? 0]
      let frames = indices.compactMap { cube_surface_page_frame(surface, $0) }
      let renderer = pixelRenderer
      let name = ((embeddedName ?? "Notebook") as NSString).deletingPathExtension
      let url = FileManager.default.temporaryDirectory.appendingPathComponent(
        UUID().uuidString, isDirectory: true
      )
      .appendingPathComponent("\(name).\(pdf ? "pdf" : "png")")
      guard !frames.isEmpty, frames.count == indices.count else {
        frames.forEach { cube_surface_frame_free($0) }
        exporting = false
        showError("无法读取页面")
        return
      }
      renderQueue.async { [weak self] in
        defer { frames.forEach { cube_surface_frame_free($0) } }
        do {
          try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
          func raster(_ frame: OpaquePointer) throws -> UIImage {
            let aspect = cube_surface_frame_aspect(frame)
            let width = UInt32(min(2048, max(1, 2048 * aspect)))
            let height = UInt32(min(2048, max(1, Double(width) / aspect)))
            renderer.prepareFonts(for: frame)
            guard cube_surface_render(renderer.handle, frame, width, height) == 0 else {
              throw NSError(
                domain: "NativeExport", code: 1, userInfo: [NSLocalizedDescriptionKey: "无法渲染页面"])
            }
            let data = Data(
              bytes: cube_surface_renderer_output_ptr(renderer.handle),
              count: cube_surface_renderer_output_len(renderer.handle))
            guard let image = self?.image(data, width: Int(width), height: Int(height), scale: 1)
            else { throw NSError(domain: "NativeExport", code: 2) }
            return image
          }
          if pdf {
            let pdfRenderer = UIGraphicsPDFRenderer(
              bounds: CGRect(x: 0, y: 0, width: 595.28, height: 841.89))
            var pageError: Error?
            try pdfRenderer.writePDF(to: url) { context in
              for frame in frames {
                guard pageError == nil else { break }
                do {
                  let image = try raster(frame)
                  context.beginPage()
                  let size = image.size
                  let scale = min(595.28 / size.width, 841.89 / size.height)
                  image.draw(
                    in: CGRect(
                      x: (595.28 - size.width * scale) / 2, y: (841.89 - size.height * scale) / 2,
                      width: size.width * scale, height: size.height * scale))
                } catch { pageError = error }
              }
            }
            if let pageError {
              try? FileManager.default.removeItem(at: url)
              throw pageError
            }
          } else if let frame = frames.first, let data = try raster(frame).pngData() {
            try data.write(to: url, options: .atomic)
          }
          DispatchQueue.main.async {
            guard let self else { return }
            self.exporting = false
            self.present(
              UIDocumentPickerViewController(forExporting: [url], asCopy: true), animated: true)
          }
        } catch {
          DispatchQueue.main.async {
            self?.exporting = false
            self?.showError(error.localizedDescription)
          }
        }
      }
    }
    private func presentColorPicker() {
      let picker = UIColorPickerViewController()
      picker.delegate = self
      picker.supportsAlpha = true
      picker.selectedColor = UIColor(noteHex: state["color"] as? String ?? "#222b40")
        .withAlphaComponent((state["opacity"] as? Double) ?? 1)
      picker.modalPresentationStyle = .popover
      picker.popoverPresentationController?.sourceView = buttons[200] ?? view
      picker.popoverPresentationController?.sourceRect =
        buttons[200]?.bounds
        ?? CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
      present(picker, animated: true)
    }
    private func chromeImage(_ action: Int) -> UIImage? {
      let scale = min(3, view.window?.screen.scale ?? 2)
      let key = "\(action)/\(scale)/\(action == 205 && state["readonly"] as? Bool == true)"
      if let cached = chromeImages[key] { return cached }
      let edge = UInt32(24 * scale)
      guard cube_surface_chrome_icon(surface, UInt32(action), edge, edge) == 0 else { return nil }
      let data = Data(
        bytes: cube_surface_output_ptr(surface), count: cube_surface_output_len(surface))
      let result = image(data, width: Int(edge), height: Int(edge), scale: scale)?
        .withRenderingMode(
          .alwaysTemplate)
      if chromeImages.count > 64 { chromeImages.removeAll() }
      chromeImages[key] = result
      return result
    }
    private func brushPreview() -> UIImage? {
      guard cube_surface_brush_preview(surface, 480, 120) == 0 else { return nil }
      return image(
        Data(bytes: cube_surface_output_ptr(surface), count: cube_surface_output_len(surface)),
        width: 480, height: 120, scale: 2)
    }
    private func matchAspect() {
      _ = request([
        "op": "resize", "canvasWidth": canvas.bounds.width, "canvasHeight": canvas.bounds.height,
      ])
      renderGeneration += 1
    }
    func adaptivePresentationStyle(for controller: UIPresentationController)
      -> UIModalPresentationStyle
    { .none }
    @objc private func action(_ button: UIButton) {
      resumeNativeTiming()
      canvas.cancelInput()
      if button.tag == 200 {
        showPanel("colors")
        return
      }
      if button.tag == 201 {
        save()
        return
      }
      if button.tag == 203 {
        showLibrary()
        return
      }
      if button.tag == 204 {
        let pages = NativePagesController(
          state: state,
          command: { [weak self] value in
            guard let self, self.request(value) else { return nil }
            self.refresh()
            self.needsFrame = true
            return self.state
          }, thumbnail: { [weak self] index, done in self?.thumbnail(index, completion: done) })
        present(pages, animated: !UIAccessibility.isReduceMotionEnabled)
        return
      }
      if button.tag == 205 {
        if request(["op": "readonly", "value": !(state["readonly"] as? Bool ?? false)]) {
          refresh()
          needsFrame = true
        }
        return
      }
      if button.tag == 206 {
        showPanel("document")
        return
      }
      if button.tag == 100 || button.tag == 101 {
        documentGeneration += 1
        resetInkPublication()
      }
      if button.tag == 202 {
        showTools()
        return
      }
      if button.tag == 12 && button.isSelected && state["selection"] is [String: Any] {
        showPanel("selection")
        return
      }
      if button.tag == 11 && button.isSelected {
        showPanel("eraser")
        return
      }
      if button.tag < 12 && button.isSelected {
        let anchor = button.convert(button.bounds, to: view)
        _ = request([
          "op": "state", "settingsAnchorX": anchor.midX - view.safeAreaLayoutGuide.layoutFrame.minX,
        ])
        let settings = NativeBrushSettingsController(state: state, preview: brushPreview()) {
          [weak self] value in
          guard let self, self.request(value) else { return nil }
          self.refresh()
          self.needsFrame = true
          return self.brushPreview()
        }
        present(settings, animated: !UIAccessibility.isReduceMotionEnabled)
        return
      }
      if button.tag >= 300 && button.tag < 305 {
        let colors = ["#222b40", "#2563eb", "#15803d", "#facc15", "#dc3658"]
        if request([
          "op": "color", "color": colors[button.tag - 300],
        ]) {
          refresh()
          needsFrame = true
        }
        return
      }
      if request(["op": "action", "action": button.tag]) {
        refresh()
        if let pen = buttons[button.tag], button.tag < 13 {
          strip.scrollRectToVisible(
            pen.frame.insetBy(dx: -4, dy: 0), animated: !UIAccessibility.isReduceMotionEnabled)
        }
        needsFrame = true
      }
    }
    @objc private func moveTray(_ gesture: UIPanGestureRecognizer) {
      if gesture.state == .began {
        canvas.cancelInput()
        trayTranslation =
          (state["trayOffset"] as? [Double]).map { CGPoint(x: $0[0], y: $0[1]) } ?? .zero
      }
      let delta = gesture.translation(in: view)
      _ = request([
        "op": "moveTray", "x": trayTranslation.x + delta.x, "y": trayTranslation.y + delta.y,
      ])
      refresh()
    }
    @objc private func resetTray() {
      _ = request(["op": "moveTray", "x": 0, "y": 0])
      refresh()
    }
    private func scheduleAutosave() {
      autosaveWork?.cancel()
      let work = DispatchWorkItem { [weak self] in self?.save(export: false) }
      autosaveWork = work
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.2, execute: work)
    }
    func flushNativeDraft(completion: @escaping () -> Void = {}) {
      backgroundFlushes.append(completion)
      displayLink?.isPaused = true
      lastFrameTick = 0
      writeMetrics(force: true)
      autosaveWork?.cancel()
      canvas.cancelInput()
      finishBackgroundFlush()
    }
    private func finishBackgroundFlush() {
      guard !saving, !backgroundFlushes.isEmpty else { return }
      if state["dirty"] as? Bool == true {
        save(export: false)
        return
      }
      let callbacks = backgroundFlushes
      backgroundFlushes.removeAll()
      callbacks.forEach { $0() }
    }
    private func showLibrary() {
      if embeddedClosed != nil {
        finishEmbedded()
        return
      }
      canvas.cancelInput()
      if saving {
        pendingLibrary = true
        return
      }
      if state["dirty"] as? Bool == true {
        pendingLibrary = true
        save(export: false)
      } else {
        presentLibrary()
      }
    }
    private func presentLibrary() {
      let library = NativeNotesLibrary(
        project: { [weak self] entries, size in
          guard let self,
            self.request([
              "op": "library", "items": entries, "layoutWidth": size.width,
              "layoutHeight": size.height,
            ])
          else { return nil }
          return self.state["library"] as? [String: Any]
        }, thumbnail: { [weak self] url, done in self?.fileThumbnail(url, completion: done) },
        open: { [weak self] url in self?.handle(url) },
        create: { [weak self] in
          guard let self else { return }
          self.autosaveWork?.cancel()
          self.saveURL = nil
          _ = self.request(["op": "new"])
          self.documentGeneration += 1
          self.renderGeneration += 1
          self.refresh()
          self.matchAspect()
          self.needsFrame = true
        }, importFile: { [weak self] in self?.presentNotebookPicker() },
        removed: { [weak self] url in
          guard let self, self.saveURL?.standardizedFileURL == url.standardizedFileURL else {
            return
          }
          self.autosaveWork?.cancel()
          self.saveURL = nil
          _ = self.request(["op": "new"])
          self.documentGeneration += 1
          self.renderGeneration += 1
          self.refresh()
          self.matchAspect()
          self.needsFrame = true
        })
      present(library, animated: true)
    }
    private func fileThumbnail(_ url: URL, completion: @escaping (UIImage?) -> Void) {
      let renderer = pixelRenderer
      renderQueue.async { [weak self] in
        guard let bytes = try? Data(contentsOf: url), let source = cube_surface_new() else {
          DispatchQueue.main.async { completion(nil) }
          return
        }
        defer { cube_surface_free(source) }
        let code = bytes.withUnsafeBytes {
          cube_surface_open(source, $0.bindMemory(to: UInt8.self).baseAddress, $0.count)
        }
        guard code == 0, let frame = cube_surface_page_frame(source, 0) else {
          DispatchQueue.main.async { completion(nil) }
          return
        }
        defer { cube_surface_frame_free(frame) }
        let aspect = cube_surface_frame_aspect(frame)
        let w = UInt32(min(512, max(1, 512 * aspect)))
        let h = UInt32(min(512, max(1, Double(w) / aspect)))
        renderer.prepareFonts(for: frame)
        let rendered = cube_surface_render(renderer.handle, frame, w, h)
        let data = Data(
          bytes: cube_surface_renderer_output_ptr(renderer.handle),
          count: cube_surface_renderer_output_len(renderer.handle))
        DispatchQueue.main.async {
          completion(
            rendered == 0 ? self?.image(data, width: Int(w), height: Int(h), scale: 2) : nil)
        }
      }
    }
    private func openNotebook() {
      canvas.cancelInput()
      guard state["dirty"] as? Bool == true else {
        presentNotebookPicker()
        return
      }
      let alert = UIAlertController(
        title: "保存当前笔记？", message: "先保存当前内容，再打开其他笔记。", preferredStyle: .alert)
      alert.addAction(UIAlertAction(title: "取消", style: .cancel))
      alert.addAction(
        UIAlertAction(title: "保存并打开", style: .default) { [weak self] _ in
          self?.save(export: false) { [weak self] in self?.presentNotebookPicker() }
        })
      present(alert, animated: true)
    }
    private func presentNotebookPicker() {
      let picker = UIDocumentPickerViewController(
        forOpeningContentTypes: [UTType(filenameExtension: "cubenote") ?? .data], asCopy: true)
      picker.delegate = self
      picker.allowsMultipleSelection = false
      present(picker, animated: true)
    }
    func documentPicker(
      _ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]
    ) { if let url = urls.first { handle(url) } }
    func colorPickerViewControllerDidSelectColor(_ viewController: UIColorPickerViewController) {
      var r: CGFloat = 0
      var g: CGFloat = 0
      var b: CGFloat = 0
      var a: CGFloat = 1
      guard viewController.selectedColor.getRed(&r, green: &g, blue: &b, alpha: &a) else { return }
      let hex = String(
        format: "#%02x%02x%02x", Int((r * 255).rounded()), Int((g * 255).rounded()),
        Int((b * 255).rounded()))
      _ = request(["op": "color", "color": hex, "opacity": a])
      refresh()
      needsFrame = true
    }
    func resumeNativeTiming() {
      if gpuEnabled {needsFrame=true}
      lastFrameTick = 0
      displayLink?.isPaused = false
    }
    private func writeMetrics(force: Bool = false) {
      let now = CACurrentMediaTime()
      guard force || (!canvas.hasActiveInput && now - lastMetricsWrite >= 2),
        cube_surface_metrics(surface) == 0
      else { return }
      lastMetricsWrite = now
      let bytes = Data(
        bytes: cube_surface_output_ptr(surface), count: cube_surface_output_len(surface))
      guard var report = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] else {
        return
      }
      report["capturedAt"] = ISO8601DateFormatter().string(from: Date())
      report["osVersion"] = UIDevice.current.systemVersion
      report["viewportPoints"] = [canvas.bounds.width, canvas.bounds.height]
      report["scope"] = "native editor timings, not hardware Pencil-to-display latency"
      report["adapterRevision"] = gpuEnabled ? "wgpu-retained-1" : "native-local-damage-7"
      report["gpu"] = gpuReport
      report["opening"] = openingReport
      report["editor"] = ["readonly": state["readonly"] ?? true, "tool": state["tool"] ?? "",
        "drawingEnabled": canvas.drawingEnabled, "fingerDraw": canvas.acceptFinger,
        "displayPaused": displayLink?.isPaused ?? true, "inkActive": inkActive,
        "inkRendering": inkRendering, "baseRendering": rendering]
      report["touches"] = canvas.touchReport
      report["camera"] = ["gestures": cameraGestures, "updates": cameraUpdates,
        "projections": cameraProjections, "movingProjections": cameraMovingProjections,
        "projectionMaxMs": cameraProjectionMaxMs, "deferredFrames": cameraDeferredFrames,
        "firstTileMs": lastRefinementFirstTileMs, "refinementMs": lastRefinementCompleteMs,
        "tileCacheHits": lastRefinementTileHits,
        "refinementJobs": cameraRefinementJobs, "imageViewportKnown": imageViewport != nil,
        "gestureActive": cameraBase != nil || nativeCameraGesture, "rasterReuses": cameraRasterReuses,
        "presentation": canvas.presentationReport]
      guard let data = try? JSONSerialization.data(withJSONObject: report, options: .sortedKeys)
      else { return }
      let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("NativeNotesMetrics.json")
      saveQueue.async {
        try? FileManager.default.createDirectory(
          at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: .atomic)
      }
    }
    private func captureInk() {
      inkNeedsCapture = false
      if gpuEnabled { return }
      let started = CACurrentMediaTime()
      defer { maxInkCaptureMs = max(maxInkCaptureMs, (CACurrentMediaTime()-started)*1000) }
      guard let viewport = state["viewport"] as? [String: Double], let frame = cube_surface_frame(surface) else { return }
      // Coalesce samples within one stroke, never replace the final patch of an
      // earlier stroke when several short strokes arrive between display ticks.
      if pendingInk.last?.id == inkID, let previous = pendingInk.popLast() {
        cube_surface_frame_free(previous.frame)
      }
      pendingInk.append(PendingInk(frame: frame, id: inkID,
        revision: (state["revision"] as? UInt64 ?? 0) + 1, document: documentGeneration, viewport: viewport))
    }
    private func flushEraserInput() {
      guard !applyingEraser, !queuedEraser.isEmpty else { return }
      let samples=queuedEraser
      queuedEraser.removeAll(keepingCapacity:true)
      applyingEraser=true
      let start=CACurrentMediaTime()
      canvas.input?(1,queuedEraserToken,queuedEraserStylus,samples)
      maxEraserApplyMs=max(maxEraserApplyMs,(CACurrentMediaTime()-start)*1000)
      applyingEraser=false
    }
    private func resetInkPublication() {
      queuedEraser.removeAll()
      for pending in pendingInk { cube_surface_frame_free(pending.frame) }
      pendingInk.removeAll()
      inkActive = false
      inkNeedsCapture = false
      publishedRevision = 0
      cancelledInk.removeAll()
      canvas.resetInk()
    }
    private func drawInkFrame() {
      guard !inkRendering, canvas.bounds.width > 0, canvas.bounds.height > 0 else { return }
      // Snapshot at most once per display update, after the worker is available.
      // Copying a growing stroke for every 120/240 Hz touch callback needlessly
      // blocks input. Pointer-up still captures its complete final frame eagerly.
      if inkNeedsCapture { captureInk() }
      guard !pendingInk.isEmpty else { return }
      let pending = pendingInk.removeFirst()
      if pending.document != documentGeneration || pending.revision <= publishedRevision || cancelledInk.contains(pending.id) {
        cube_surface_frame_free(pending.frame)
        return
      }
      inkRendering = true
      let renderer = inkRenderer
      let size = canvas.bounds.size
      let scale = min(2, view.window?.screen.scale ?? 2)
      let width = UInt32((size.width * scale).rounded())
      let height = UInt32((size.height * scale).rounded())
      inkQueue.async { [weak self] in
        defer { cube_surface_frame_free(pending.frame) }
        let start = CACurrentMediaTime()
        let code = cube_surface_render_ink(renderer.handle, pending.frame, width, height)
        let info = cube_surface_layers(renderer.handle)
        let data = Data(bytes: cube_surface_renderer_output_ptr(renderer.handle),
          count: cube_surface_renderer_output_len(renderer.handle))
        let elapsed = (CACurrentMediaTime() - start) * 1000
        DispatchQueue.main.async {
          guard let self else { return }
          self.inkRendering = false
          _ = cube_surface_metric(self.surface, 7, elapsed)
          guard code == 0, pending.document == self.documentGeneration,
            !self.cancelledInk.contains(pending.id), pending.revision > self.publishedRevision,
            let image = self.image(data, width: Int(info.width), height: Int(info.height), scale: scale) else { return }
          let frame = CGRect(x: CGFloat(info.x) / CGFloat(width) * size.width,
            y: CGFloat(info.y) / CGFloat(height) * size.height,
            width: CGFloat(info.width) / CGFloat(width) * size.width,
            height: CGFloat(info.height) / CGFloat(height) * size.height)
          self.canvas.publishInk(image, frame: frame, id: pending.id, revision: pending.revision, viewport: pending.viewport)
          self.lastInkRenderMs = elapsed
          self.inkFramesPublished += 1
        }
      }
    }
    private func drawGpuFrame() {
      let captureStart=CACurrentMediaTime()
      guard needsFrame, !gpuBusy, let gpuWorker, canvas.bounds.width>0, canvas.bounds.height>0,
        let frame=cube_surface_frame(surface) else { return }
      let scale=min(2,view.window?.screen.scale ?? 2)
      let w=canvas.bounds.width*scale, h=canvas.bounds.height*scale
      let ratio=min(1,sqrt(8_000_000/max(1,w*h)),4096/max(w,h))
      let width=UInt32(max(1,(w*ratio).rounded(.down)))
      let height=UInt32(max(1,(h*ratio).rounded(.down)))
      maxInkCaptureMs=max(maxInkCaptureMs,(CACurrentMediaTime()-captureStart)*1000)
      needsFrame=false;gpuBusy=true
      let document=documentGeneration
      let live=inkActive || inkNeedsCapture
      inkNeedsCapture=false
      gpuWorker.render(frame:frame,width:width,height:height) { [weak self] result in
        guard let self else { return }
        self.gpuBusy=false
        guard document==self.documentGeneration else {self.needsFrame=true;return}
        switch result {
        case .success((_,let report)):
          self.gpuReport=report
          self.gpuSequence += 1
          if live {self.inkFramesPublished += 1;self.lastInkRenderMs=report["workerMs"] as? Double ?? 0}
          self.publishedRevision=self.state["revision"] as? UInt64 ?? 0
          self.cameraNeedsRefinement=false
          if self.awaitingFirstRaster {
            self.awaitingFirstRaster=false
            self.openingReport["firstRasterMs"]=(CACurrentMediaTime()-self.notebook.startedAt)*1000
          }
          if self.awaitingDetailedRaster {
            self.awaitingDetailedRaster=false
            self.openingReport["detailedRasterMs"]=(CACurrentMediaTime()-self.notebook.startedAt)*1000
          }
        case .failure(let error):
          // Preserve access to the file on adapter loss without retrying an
          // invalid GPU frame every display tick. Surface the failure to the user.
          self.gpuEnabled=false
          self.canvas.metal.isHidden=true
          self.needsFrame=true
          self.showError(error.localizedDescription)
        }
      }
    }
    #if DEBUG
    func gpuPixels(width:UInt32=800,height:UInt32=800,completion:@escaping (Data)->Void) {
      guard let gpuWorker, let frame=cube_surface_frame(surface) else {completion(Data());return}
      gpuWorker.render(frame:frame,width:width,height:height,readback:true) { result in
        if case .success((let pixels,_))=result {completion(pixels)} else {completion(Data())}
      }
    }
    #endif
    fileprivate func drawFrame() {
      flushEraserInput()
      let requestedAt = CACurrentMediaTime()
      if lastFrameTick > 0 {
        _ = cube_surface_metric(surface, 2, (requestedAt - lastFrameTick) * 1000)
      }
      lastFrameTick = requestedAt
      writeMetrics()
      if gpuEnabled { drawGpuFrame(); return }
      drawInkFrame()
      if selectionManipulating { return }
      if cameraBase != nil || nativeCameraGesture {
        if needsFrame { cameraDeferredFrames += 1 }
        return
      }
      if cameraNeedsRefinement, imageIsDetailed, imageDocument == documentGeneration,
        publishedRevision == state["revision"] as? UInt64,
        let imageViewport, let current = state["viewport"] as? [String: Double],
        NativeCanvasProjection.canReuse(imageViewport, for: current) {
        cameraRasterReuses += 1
        cameraNeedsRefinement = false
        needsFrame = false
        return
      }
      guard needsFrame, !rendering, !inkActive, cameraBase == nil, !nativeCameraGesture, canvas.bounds.width > 0, canvas.bounds.height > 0,
        let currentViewport = state["viewport"] as? [String: Double],
        let snapshot = cube_surface_frame(surface)
      else { return }
      let tiled = !awaitingFirstRaster && canvas.image != nil
      // World-aligned tiles already include a reusable border. Do not also
      // rasterize a second 25% fringe outside the visible camera on every zoom.
      let viewport = tiled ? currentViewport : NativeCanvasProjection.covering(currentViewport)
      guard cube_surface_frame_viewport(snapshot, viewport["x"]!, viewport["y"]!, viewport["width"]!, viewport["height"]!) == 0 else {
        cube_surface_frame_free(snapshot)
        return
      }
      needsFrame = false
      rendering = true
      if cameraNeedsRefinement {
        cameraRefinementJobs += 1; cameraNeedsRefinement = false
        lastRefinementFirstTileMs = 0
      }
      let generation = renderGeneration
      let document = documentGeneration
      let revision = state["revision"] as? UInt64 ?? 0
      let publishBase = needsBasePublication
      let publishOpeningPreview = awaitingFirstRaster
      let renderer = pixelRenderer
      let cancellation = NativeRenderCancellation()
      renderCancellation = cancellation
      let scale = min(2, view.window?.screen.scale ?? 2)
      let budget = min(tiled ? 1.0 : 1.25, sqrt(16_000_000 / max(1, canvas.bounds.width * canvas.bounds.height * scale * scale)),
        8192 / max(canvas.bounds.width * scale, canvas.bounds.height * scale))
      let width = UInt32((canvas.bounds.width * scale * budget).rounded(.down))
      let height = UInt32((canvas.bounds.height * scale * budget).rounded(.down))
      let previewRatio = min(1, 768 / max(Double(width) / scale, Double(height) / scale))
      let previewWidth = UInt32(max(1, (Double(width) / scale * previewRatio).rounded()))
      let previewHeight = UInt32(max(1, (Double(height) / scale * previewRatio).rounded()))
      let previewURL = notebook.previewCacheURL(viewport: viewport, width: previewWidth, height: previewHeight)
      renderQueue.async { [weak self] in
        defer { cube_surface_frame_free(snapshot) }
        cube_surface_renderer_cancellation(renderer.handle,cancellation.nativeToken)
        if publishOpeningPreview {
          var preview = previewURL.flatMap { UIImage(contentsOfFile: $0.path)?.cgImage }
          let cached = preview != nil
          if preview == nil {
            renderer.prepareFonts(for: snapshot)
          }
          if preview == nil && cube_surface_render_preview(renderer.handle, snapshot, previewWidth, previewHeight) == 0 {
            let bytes = Data(bytes: cube_surface_renderer_output_ptr(renderer.handle), count: cube_surface_renderer_output_len(renderer.handle))
            preview = makeImage(bytes, previewWidth, previewHeight)

          }
          if let preview {
            let cachedExact = cached && preview.width == Int(width) && preview.height == Int(height) && revision == 0
            DispatchQueue.main.async {
              guard let self else { return }
              if cachedExact { self.rendering = false }
              guard generation == self.renderGeneration, self.awaitingFirstRaster else {
                if cachedExact { self.needsBasePublication = true; self.needsFrame = true }
                return
              }
              self.canvas.image = UIImage(cgImage: preview, scale: 1, orientation: .up)
              self.imageViewport = viewport
              self.imageDocument = document
              self.imageIsDetailed = cachedExact
              self.publishedRevision = revision
              self.canvas.acceptBase(revision: revision)
              self.updateCameraPreview()
              self.awaitingFirstRaster = false
              self.openingReport["previewCacheHit"] = cached
              self.openingReport["firstRasterMs"] = (CACurrentMediaTime() - self.notebook.startedAt) * 1000
              if cachedExact {
                self.needsBasePublication = false
                self.awaitingDetailedRaster = false
                self.openingReport["detailedRasterMs"] = self.openingReport["firstRasterMs"]
                self.openingReport["exactCacheReuse"] = true
              }
              self.writeMetrics(force: true)
            }
            if cachedExact { return }
          }
        }
        renderer.prepareFonts(for: snapshot)
        let start = CACurrentMediaTime()
        var publicationViewport = viewport
        var publicationWidth = width
        var publicationHeight = height
        var tileHits = 0
        var firstTileMs = 0.0
        var code: UInt32 = 0
        if tiled {
          code = cube_surface_tiles_begin(renderer.handle, snapshot, width, height)
          if code == 0 {
            let plan = cube_surface_tile_info(renderer.handle)
            publicationViewport = ["x": plan.viewport_x, "y": plan.viewport_y,
              "width": plan.viewport_width, "height": plan.viewport_height]
            publicationWidth = plan.total_width
            publicationHeight = plan.total_height
            let source = publicationViewport
            DispatchQueue.main.async {
              guard let self, generation == self.renderGeneration else { return }
              self.lastRefinementRasterSize = CGSize(width: Int(plan.total_width), height: Int(plan.total_height))
              self.canvas.beginRefinement(viewport: source, width: Int(plan.total_width), height: Int(plan.total_height))
            }
            while !cancellation.isCancelled {
              code = cube_surface_tiles_next(renderer.handle)
              if code != 0 { break }
              let tile = cube_surface_tile_info(renderer.handle)
              if tile.width == 0 { break }
              if tile.cached != 0 { tileHits += 1 }
              let bytes = Data(bytes: cube_surface_renderer_output_ptr(renderer.handle), count: cube_surface_renderer_output_len(renderer.handle))
              if let tileImage = makeImage(bytes, tile.width, tile.height) {
                let elapsed = (CACurrentMediaTime() - start)*1000
                if firstTileMs == 0 { firstTileMs = elapsed }
                DispatchQueue.main.async {
                  guard let self, generation == self.renderGeneration else { return }
                  self.canvas.publishTile(UIImage(cgImage: tileImage), x: Int(tile.x), y: Int(tile.y))
                  if self.lastRefinementFirstTileMs == 0 { self.lastRefinementFirstTileMs = (CACurrentMediaTime() - start)*1000 }
                }
              }
              if tile.done != 0 { break }
            }
          }
          if cancellation.isCancelled {
            cube_surface_tiles_cancel(renderer.handle)
            DispatchQueue.main.async {
              guard let self else { return }
              self.rendering = false
              self.needsBasePublication = true
              self.needsFrame = true
            }
            return
          }
        } else {
          code = cube_surface_render_layers(renderer.handle, snapshot, width, height)
        }
        let info = cube_surface_layers(renderer.handle)
        let data = Data(
          bytes: cube_surface_renderer_output_ptr(renderer.handle),
          count: cube_surface_renderer_output_len(renderer.handle))
        func makeImage(_ data: Data, _ w: UInt32, _ h: UInt32) -> CGImage? {
          guard w > 0, h > 0, let provider = CGDataProvider(data: data as CFData) else {
            return nil
          }
          return CGImage(
            width: Int(w), height: Int(h), bitsPerComponent: 8, bitsPerPixel: 32,
            bytesPerRow: Int(w) * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
        }
        var base: CGImage?
        if code == 0 && (tiled || info.base_changed != 0 || publishBase) {
          base = makeImage(
            Data(
              bytes: cube_surface_base_ptr(renderer.handle),
              count: cube_surface_base_len(renderer.handle)), publicationWidth, publicationHeight)
        }
        if publishOpeningPreview, revision == 0, let base, let previewURL,
          let png = UIImage(cgImage: base).pngData() {
          // Reopens use the completed exact raster, not the temporary first paint.
          try? FileManager.default.createDirectory(at: previewURL.deletingLastPathComponent(), withIntermediateDirectories: true)
          try? png.write(to: previewURL, options: .atomic)
          let folder = previewURL.deletingLastPathComponent()
          let entries = (try? FileManager.default.contentsOfDirectory(at: folder,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey])) ?? []
          var totalBytes = entries.reduce(0) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
          var count = entries.count
          let oldest = entries.sorted {
            ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast)
              < ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast)
          }
          for entry in oldest where entry != previewURL {
            guard count > 24 || totalBytes > 64 * 1024 * 1024 else { break }
            totalBytes -= (try? entry.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            count -= 1
            try? FileManager.default.removeItem(at: entry)
          }
        }
        let elapsed = (CACurrentMediaTime() - start) * 1000
        let finalViewport = publicationViewport
        let completedTileHits = tileHits
        let completedFirstTileMs = firstTileMs
        DispatchQueue.main.async {
          guard let self else { return }
          self.rendering = false
          _ = cube_surface_metric(self.surface, 1, elapsed)
          if tiled || info.base_changed != 0 {
            _ = cube_surface_metric(self.surface, 6, elapsed)
          } else if info.width > 0 {
            _ = cube_surface_metric(self.surface, 7, elapsed)
          }
          self.log.debug(
            "Rust frame preview=\(info.width > 0, privacy: .public) took \(elapsed, privacy: .public) ms"
          )
          if elapsed > 33 { self.log.notice("Rust frame took \(elapsed, privacy: .public) ms") }
          if generation != self.renderGeneration {
            self.needsBasePublication = true
            self.needsFrame = true
            return
          }
          if code == 0 {
            if let base {
              self.canvas.image = UIImage(cgImage: base, scale: scale, orientation: .up)
              self.imageViewport = finalViewport
              if tiled {
                if self.lastRefinementFirstTileMs == 0 { self.lastRefinementFirstTileMs = completedFirstTileMs }
                self.lastRefinementCompleteMs = elapsed
                self.lastRefinementTileHits = completedTileHits
              }
              self.imageDocument = document
              self.imageIsDetailed = true
              self.needsBasePublication = false
              self.publishedRevision = revision
              self.canvas.acceptBase(revision: revision)
              self.updateCameraPreview()
              if self.awaitingFirstRaster {
                self.awaitingFirstRaster = false
                self.openingReport["firstRasterMs"] = (CACurrentMediaTime() - self.notebook.startedAt) * 1000
                self.writeMetrics(force: true)
              }
              if self.awaitingDetailedRaster {
                self.awaitingDetailedRaster = false
                self.openingReport["detailedRasterMs"] = (CACurrentMediaTime() - self.notebook.startedAt) * 1000
              }
            }
            _ = cube_surface_metric(self.surface, 3, (CACurrentMediaTime() - requestedAt) * 1000)
          } else {
            self.showError(String(data: data, encoding: .utf8) ?? "Native render failed")
          }
        }
      }
    }
    func gestureRecognizer(
      _ gestureRecognizer: UIGestureRecognizer,
      shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool { true }
    private func updateCameraPreview() {
      if gpuEnabled {
        if let viewport = state["viewport"] as? [String:Double] { canvas.projectInk(to:viewport) }
        cameraProjections += 1
        cameraMovingProjections += 1
        needsFrame = true
        return
      }
      guard let imageViewport, let viewport = state["viewport"] as? [String: Double] else { return }
      let start = CACurrentMediaTime()
      let transform = NativeCanvasProjection.transform(from: imageViewport, to: viewport, size: canvas.bounds.size)
      canvas.projectRaster(transform)
      canvas.projectInk(to: viewport)
      cameraProjections += 1
      if !transform.isIdentity { cameraMovingProjections += 1 }
      cameraProjectionMaxMs = max(cameraProjectionMaxMs, (CACurrentMediaTime() - start) * 1000)
    }
    @objc private func cameraChanged(_ recognizer: UIGestureRecognizer) {
      if recognizer.state == .began {
        resumeNativeTiming()
        canvas.cancelInput()
        if cameraBase == nil {
          cameraGestures += 1
          cameraBase = state["viewport"] as? [String: Double]
          pan.setTranslation(.zero, in: canvas)
          pinch.scale = 1
        }
      }
      guard let base = cameraBase else { return }
      let scale = min(20, max(0.05, pinch.scale))
      let translation = pan.translation(in: canvas)
      let width = (base["width"] ?? 595) / scale
      let height = (base["height"] ?? 842) / scale
      let viewport: [String: Double] = [
        "x": (base["x"] ?? 0) + ((base["width"] ?? 595) - width) / 2 - translation.x
          / max(1, canvas.bounds.width) * width,
        "y": (base["y"] ?? 0) + ((base["height"] ?? 842) - height) / 2 - translation.y
          / max(1, canvas.bounds.height) * height,
        "width": width, "height": height,
      ]
      if request(["op": "camera", "viewport": viewport]) {
        cameraUpdates += 1
        cameraNeedsRefinement = true
        updateCameraPreview()
        updateSelection()
        updateTapeOverlay()
        needsFrame = true
      }
      if [.ended, .cancelled, .failed].contains(recognizer.state),
        ![.began, .changed].contains(pan.state), ![.began, .changed].contains(pinch.state)
      {
        cameraBase = nil
        updateSelectionPresentation()
      }
    }
    func handle(_ url: URL) {
      loadViewIfNeeded()
      canvas.cancelInput()
      let access = url.startAccessingSecurityScopedResource()
      defer { if access { url.stopAccessingSecurityScopedResource() } }
      do {
        let data = try Data(contentsOf: url)
        let code = data.withUnsafeBytes {
          cube_surface_open(surface, $0.bindMemory(to: UInt8.self).baseAddress, $0.count)
        }
        if code != 0 {
          showError(surfaceError())
          return
        }
        autosaveWork?.cancel()
        renderGeneration += 1
        documentGeneration += 1
        resetInkPublication()
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
          .standardizedFileURL
        saveURL = url.deletingLastPathComponent().standardizedFileURL == documents ? url : nil
        refresh()
        matchAspect()
        needsFrame = true
      } catch { showError(error.localizedDescription) }
    }
    func prepareEmbedded(
      at url: URL, fileName: String, readonly: Bool,
      loadedSession: NativeNotebookSession? = nil,
      closed: @escaping (URL, Bool, String?) -> Void
    ) throws {
      let start = CACurrentMediaTime()
      loadViewIfNeeded()
      if let loadedSession { notebook = loadedSession }
      else {
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        notebook = data.isEmpty ? NativeNotebookSession() : try NativeNotebookSession(data: data)
      }
      autosaveWork?.cancel()
      saveURL = url
      embeddedName = fileName
      embeddedClosed = closed
      documentGeneration += 1
      resetInkPublication()
      imageDocument = nil
      imageIsDetailed = false
      _ = request(["op": "readonly", "value": readonly])
      refresh()
      if lastLayout.width > 0 && lastLayout.height > 0 { matchAspect() }
      embeddedRevision = state["revision"] as? UInt64 ?? 0
      renderGeneration += 1
      needsBasePublication = true
      needsFrame = true
      openingReport = ["archiveDecodeMs": notebook.decodeMilliseconds,
        "reusedDecodedSession": loadedSession != nil, "mainSetupMs": (CACurrentMediaTime() - start) * 1000]
      awaitingFirstRaster = true
      awaitingDetailedRaster = true
      modalPresentationStyle = .fullScreen
    }
    private func finishEmbedded() {
      guard let closed = embeddedClosed, !embeddedClosing else { return }
      canvas.cancelInput()
      pendingEmbeddedClose = true
      guard !saving else { return }
      pendingEmbeddedClose = false
      embeddedClosing = true
      let changed = (state["revision"] as? UInt64 ?? 0) != embeddedRevision
      save(export: false) { [weak self] in
        guard let self, let url = self.saveURL else { return }
        self.fileThumbnail(url) { image in
          let preview = image?.pngData().map { "data:image/png;base64," + $0.base64EncodedString() }
          closed(url, changed, preview)
        }
      }
    }
    private func save(export: Bool = true, completion: (() -> Void)? = nil) {
      guard !saving, let snapshot = cube_surface_snapshot(surface) else { return }
      saving = true
      let revision = state["revision"] as? UInt64 ?? 0
      let epoch = state["documentEpoch"] as? UInt64 ?? 0
      let generation = documentGeneration
      let url =
        saveURL
        ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Native notebook \(UUID().uuidString.prefix(8)).cubenote")
      let exportURL =
        export
        ? FileManager.default.temporaryDirectory.appendingPathComponent(
          UUID().uuidString, isDirectory: true
        )
        .appendingPathComponent(embeddedName ?? url.lastPathComponent) : nil
      saveQueue.async { [weak self] in
        defer { cube_notes_snapshot_free(snapshot) }
        do {
          let startedAt = CACurrentMediaTime()
          let code = cube_notes_snapshot_save(snapshot)
          let data = Data(
            bytes: cube_notes_snapshot_output_ptr(snapshot),
            count: cube_notes_snapshot_output_len(snapshot))
          if code != 0 {
            throw NSError(
              domain: "RustNotes", code: 1,
              userInfo: [
                NSLocalizedDescriptionKey: String(data: data, encoding: .utf8) ?? "Save failed"
              ])
          }
          try data.write(to: url, options: .atomic)
          if let exportURL {
            try FileManager.default.createDirectory(
              at: exportURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: exportURL)
          }
          let elapsed = (CACurrentMediaTime() - startedAt) * 1000
          DispatchQueue.main.async {
            guard let self else { return }
            self.saving = false
            _ = cube_surface_metric(self.surface, 4, elapsed)
            if generation == self.documentGeneration {
              self.saveURL = url
              self.request(["op": "markSaved", "revision": revision, "documentEpoch": epoch])
              self.refresh()
              self.draftSaved?(revision != self.embeddedRevision)
            }
            if export {
              self.present(
                UIDocumentPickerViewController(forExporting: [exportURL ?? url], asCopy: true),
                animated: true)
            } else if generation == self.documentGeneration {
              completion?()
            }
            if self.pendingLibrary && self.state["dirty"] as? Bool != true {
              self.pendingLibrary = false
              self.presentLibrary()
            }
            if self.pendingEmbeddedClose { self.finishEmbedded() }
            self.finishBackgroundFlush()
            if self.state["dirty"] as? Bool == true { self.scheduleAutosave() }
          }
        } catch {
          DispatchQueue.main.async {
            self?.saving = false
            self?.pendingLibrary = false
            self?.pendingEmbeddedClose = false
            self?.embeddedClosing = false
            let callbacks = self?.backgroundFlushes ?? []
            self?.backgroundFlushes.removeAll()
            callbacks.forEach { $0() }
            self?.showError(error.localizedDescription)
          }
        }
      }
    }
    private func surfaceError() -> String {
      String(
        data: Data(
          bytes: cube_surface_output_ptr(surface), count: cube_surface_output_len(surface)),
        encoding: .utf8) ?? "Native notes error"
    }
    private func showError(_ message: String) {
      log.error("Native notes error: \(message, privacy: .public)")
      guard presentedViewController == nil else { return }
      let alert = UIAlertController(
        title: "手写笔记", message: message, preferredStyle: .alert)
      alert.addAction(UIAlertAction(title: "OK", style: .default))
      present(alert, animated: true)
    }
  }
#endif
