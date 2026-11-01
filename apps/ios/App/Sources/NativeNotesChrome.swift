#if CUBE_NATIVE_NOTES
  import UIKit

  extension UIColor {
    convenience init(noteHex: String) {
      let rgb =
        UInt32(noteHex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16)
        ?? 0x222b40
      self.init(
        red: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255,
        blue: CGFloat(rgb & 255) / 255, alpha: 1)
    }
  }

  extension UIColor {
    static let notePanel = UIColor {
      $0.userInterfaceStyle == .dark ? UIColor(noteHex: "#242936") : .white
    }
    static let noteText = UIColor {
      UIColor(noteHex: $0.userInterfaceStyle == .dark ? "#e7ecf5" : "#303647")
    }
    static let noteMuted = UIColor {
      UIColor(noteHex: $0.userInterfaceStyle == .dark ? "#a8b4ca" : "#6b7180")
    }
    static let noteBorder = UIColor {
      UIColor(noteHex: $0.userInterfaceStyle == .dark ? "#354055" : "#e4e6eb")
    }
    static let noteAccent = UIColor {
      UIColor(noteHex: $0.userInterfaceStyle == .dark ? "#a6a0ff" : "#5954dc")
    }
    static let noteSelected = UIColor {
      UIColor(noteHex: $0.userInterfaceStyle == .dark ? "#383551" : "#eeedfc")
    }
    static let noteHover = UIColor {
      UIColor(noteHex: $0.userInterfaceStyle == .dark ? "#293245" : "#f4f4f8")
    }
  }

  /// Buttons remain tappable while horizontal drags belong to the tool strip.
  final class NativeToolStrip: UIScrollView {
    override func touchesShouldCancel(in view: UIView) -> Bool { true }
  }

  /// OS widgets only; layout, glyph pixels, selection and presets come from the Rust surface.
  final class NativeToolButton: UIButton {
    private let glyph = UIImageView()
    private let valueLabel = UILabel()
    override init(frame: CGRect) {
      super.init(frame: frame)
      glyph.isUserInteractionEnabled = false
      addSubview(glyph)
      valueLabel.font = .systemFont(ofSize: 6.2)
      valueLabel.textAlignment = .center
      valueLabel.isUserInteractionEnabled = false
      addSubview(valueLabel)
      layer.cornerRadius = 14
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    func configure(_ item: [String: Any], image: UIImage?) {
      let selected = item["selected"] as? Bool ?? false
      isSelected = selected
      accessibilityTraits = selected ? [.button, .selected] : [.button]
      accessibilityLabel = item["title"] as? String
      let width = (item["value"] as? NSNumber)?.doubleValue ?? 2
      accessibilityValue = String(format: "%g 点", width)
      accessibilityHint = selected ? "再次轻点调整画笔" : "选择画笔"
      backgroundColor = selected ? .noteSelected : .clear
      glyph.image = image
      let h: CGFloat = bounds.height < 80 ? 56 : 82
      let lift: CGFloat = selected ? -3 : 5
      valueLabel.font = .systemFont(ofSize: 9 * h / 120)
      glyph.frame = CGRect(
        x: (bounds.width - 40) / 2, y: bounds.height - h - 3 + lift, width: 40, height: h)
      let style = item["glyph"] as? String ?? ""
      valueLabel.textColor =
        ["brush", "pencil", "crayon", "reed"].contains(style) ? .white : UIColor(noteHex: "#5a626e")
      valueLabel.text = style == "lasso" ? "" : String(format: "%g", width)
      valueLabel.frame = CGRect(
        x: 0, y: glyph.frame.minY + h * 0.705, width: bounds.width, height: h * 0.12)
    }
    override var isHighlighted: Bool { didSet { alpha = isHighlighted ? 0.55 : 1 } }
  }

  final class NativeSwatchButton: UIButton {
    var circleDiameter: CGFloat = 29 { didSet { setNeedsDisplay() } }
    var swatch = UIColor.black { didSet { setNeedsDisplay() } }
    var rainbow = false { didSet { setNeedsDisplay() } }
    var ring = false { didSet { setNeedsDisplay() } }
    override func draw(_ rect: CGRect) {
      guard let ctx = UIGraphicsGetCurrentContext() else { return }
      let circle = CGRect(
        x: (bounds.width - circleDiameter) / 2, y: (bounds.height - circleDiameter) / 2, width: circleDiameter, height: circleDiameter)
      ctx.saveGState()
      ctx.addEllipse(in: circle)
      ctx.clip()
      if rainbow {
        let center = CGPoint(x: circle.midX, y: circle.midY)
        for i in 0..<120 {
          let a = CGFloat(i) / 120 * .pi * 2
          let b = CGFloat(i + 2) / 120 * .pi * 2
          ctx.setFillColor(
            UIColor(hue: CGFloat(i) / 120, saturation: 0.85, brightness: 0.98, alpha: 1).cgColor)
          ctx.move(to: center)
          ctx.addLine(to: CGPoint(x: center.x + 22 * cos(a), y: center.y + 22 * sin(a)))
          ctx.addLine(to: CGPoint(x: center.x + 22 * cos(b), y: center.y + 22 * sin(b)))
          ctx.closePath()
          ctx.fillPath()
        }
      } else {
        ctx.setFillColor(swatch.cgColor)
        ctx.fill(circle)
      }
      ctx.restoreGState()
      ctx.setStrokeColor(UIColor.noteText.withAlphaComponent(0.15).cgColor)
      ctx.setLineWidth(1)
      ctx.strokeEllipse(in: circle)
      if ring {
        ctx.setStrokeColor(UIColor.noteAccent.cgColor)
        ctx.setLineWidth(2)
        ctx.strokeEllipse(in: circle.insetBy(dx: -3.5, dy: -3.5))
      }
    }
    override var isHighlighted: Bool { didSet { alpha = isHighlighted ? 0.55 : 1 } }
  }

  private final class NativePageCell: UICollectionViewCell {
    let thumbnail = UIImageView()
    let caption = UILabel()
    var represented = -1
    override init(frame: CGRect) {
      super.init(frame: frame)
      layer.cornerRadius = 12
      thumbnail.contentMode = .scaleAspectFit
      thumbnail.layer.cornerRadius = 2
      contentView.addSubview(thumbnail)
      contentView.addSubview(caption)
      caption.font = .systemFont(ofSize: 12)
      caption.textAlignment = .center
      isAccessibilityElement = true
      accessibilityTraits = .button
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func layoutSubviews() {
      super.layoutSubviews()
      thumbnail.frame = CGRect(x: 8, y: 8, width: bounds.width - 16, height: 134)
      caption.frame = CGRect(x: 4, y: 150, width: bounds.width - 8, height: 22)
    }
  }

  final class NativePagesController: UIViewController, UICollectionViewDataSource,
    UICollectionViewDelegateFlowLayout
  {
    private var state: [String: Any]
    private let command: ([String: Any]) -> [String: Any]?
    private let thumbnail: (Int, @escaping (UIImage?) -> Void) -> Void
    private var items: [[String: Any]] = []
    private let card = UIView(), shadow = UIView(), titleLabel = UILabel()
    private let pages = UIButton(type: .system), scenes = UIButton(type: .system),
      all = UIButton(type: .system), bookmarks = UIButton(type: .system)
    private let add = UIButton(type: .system), closeButton = UIButton(type: .system)
    private let grid: UICollectionView
    private let empty = UILabel()
    private var generation = 0
    init(
      state: [String: Any], command: @escaping ([String: Any]) -> [String: Any]?,
      thumbnail: @escaping (Int, @escaping (UIImage?) -> Void) -> Void
    ) {
      self.state = state
      self.command = command
      self.thumbnail = thumbnail
      let layout = UICollectionViewFlowLayout()
      layout.minimumInteritemSpacing = 8
      layout.minimumLineSpacing = 8
      grid = UICollectionView(frame: .zero, collectionViewLayout: layout)
      super.init(nibName: nil, bundle: nil)
      modalPresentationStyle = .overFullScreen
      modalTransitionStyle = .crossDissolve
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func loadView() {
      let outside = UIControl()
      outside.addTarget(self, action: #selector(close), for: .touchUpInside)
      view = outside
    }
    override func viewDidLoad() {
      super.viewDidLoad()
      view.backgroundColor = .clear
      shadow.layer.cornerRadius = 20
      shadow.backgroundColor = .notePanel
      shadow.layer.shadowColor = UIColor(noteHex: "#24324d").cgColor
      shadow.layer.shadowOpacity = 0.14
      shadow.layer.shadowRadius = 20
      shadow.layer.shadowOffset = CGSize(width: 0, height: 6)
      view.addSubview(shadow)
      view.addSubview(card)
      card.backgroundColor = .notePanel
      card.layer.cornerRadius = 20
      card.layer.borderColor = UIColor.noteBorder.cgColor
      card.layer.borderWidth = 1
      card.accessibilityViewIsModal = true
      titleLabel.font = .systemFont(ofSize: 12, weight: .medium)
      titleLabel.textColor = .noteMuted
      card.addSubview(titleLabel)
      for (button, title, selector) in [
        (pages, "页面", #selector(showPages)), (scenes, "区域", #selector(showScenes)),
        (all, "全部页面", #selector(showAll)), (bookmarks, "只看书签", #selector(showBookmarks)),
      ] {
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 12)
        button.layer.cornerRadius = 9
        button.addTarget(self, action: selector, for: .touchUpInside)
        card.addSubview(button)
      }
      for (button, icon, title, selector) in [
        (add, "plus", "添加页面", #selector(addPage)), (closeButton, "xmark", "关闭", #selector(close)),
      ] {
        button.setImage(
          UIImage(systemName: icon, withConfiguration: UIImage.SymbolConfiguration(pointSize: 18)),
          for: .normal)
        button.accessibilityLabel = title
        button.tintColor = .noteText
        button.addTarget(self, action: selector, for: .touchUpInside)
        card.addSubview(button)
      }
      grid.backgroundColor = .clear
      grid.dataSource = self
      grid.delegate = self
      grid.register(NativePageCell.self, forCellWithReuseIdentifier: "page")
      card.addSubview(grid)
      empty.font = .systemFont(ofSize: 12)
      empty.textColor = .noteMuted
      empty.textAlignment = .center
      empty.numberOfLines = 0
      card.addSubview(empty)
      sync()
    }
    private var panel: [String: Any] { state["pagePanel"] as? [String: Any] ?? [:] }
    private func sync() {
      generation += 1
      items = panel["items"] as? [[String: Any]] ?? []
      titleLabel.text = "页面 · \(panel["count"] as? Int ?? 1)"
      let isScenes = panel["tab"] as? String == "scenes"
      let only = panel["bookmarksOnly"] as? Bool ?? false
      for (button, selected) in [
        (pages, !isScenes), (scenes, isScenes), (all, !only), (bookmarks, only),
      ] {
        button.backgroundColor = selected ? .noteSelected : .noteHover
        button.setTitleColor(selected ? .noteAccent : .noteMuted, for: .normal)
        button.accessibilityTraits = selected ? [.button, .selected] : [.button]
      }
      add.isEnabled = panel["readonly"] as? Bool != true
      add.alpha = add.isEnabled ? 1 : 0.3
      all.isHidden = isScenes
      bookmarks.isHidden = isScenes
      empty.text = isScenes ? "尚未保存区域" : "没有书签页"
      empty.isHidden = !items.isEmpty
      grid.reloadData()
      view.setNeedsLayout()
    }
    override func viewDidLayoutSubviews() {
      super.viewDidLayoutSubviews()
      guard let f = panel["frame"] as? [String: Double] else { return }
      let origin = view.safeAreaLayoutGuide.layoutFrame.origin
      card.frame = CGRect(
        x: origin.x + (f["x"] ?? 12), y: origin.y + (f["y"] ?? 64), width: f["width"] ?? 320,
        height: f["height"] ?? 400)
      shadow.frame = card.frame
      shadow.layer.shadowPath = UIBezierPath(roundedRect: shadow.bounds, cornerRadius: 20).cgPath
      let w = card.bounds.width
      titleLabel.frame = CGRect(x: 12, y: 12, width: w - 112, height: 44)
      add.frame = CGRect(x: w - 100, y: 12, width: 44, height: 44)
      closeButton.frame = CGRect(x: w - 56, y: 12, width: 44, height: 44)
      pages.frame = CGRect(x: 12, y: 64, width: (w - 32) / 2, height: 40)
      scenes.frame = CGRect(x: 20 + (w - 32) / 2, y: 64, width: (w - 32) / 2, height: 40)
      all.frame = CGRect(x: 12, y: 112, width: (w - 24) / 2, height: 44)
      bookmarks.frame = CGRect(x: w / 2, y: 112, width: (w - 24) / 2, height: 44)
      let y: CGFloat = panel["tab"] as? String == "scenes" ? 112 : 164
      grid.frame = CGRect(x: 16, y: y, width: w - 32, height: max(1, card.bounds.height - y - 12))
      empty.frame = grid.frame
      grid.collectionViewLayout.invalidateLayout()
    }
    @objc private func close() { dismiss(animated: !UIAccessibility.isReduceMotionEnabled) }
    private func run(_ value: [String: Any]) {
      if let next = command(value) {
        state = next
        sync()
      }
    }
    @objc private func showPages() {
      run(["op": "rail", "tab": "pages", "bookmarksOnly": panel["bookmarksOnly"] as? Bool ?? false])
    }
    @objc private func showScenes() { run(["op": "rail", "tab": "scenes"]) }
    @objc private func showAll() { run(["op": "rail", "tab": "pages", "bookmarksOnly": false]) }
    @objc private func showBookmarks() {
      run(["op": "rail", "tab": "pages", "bookmarksOnly": true])
    }
    @objc private func addPage() {
      if panel["tab"] as? String == "scenes" {
        let alert = UIAlertController(title: "保存区域", message: "为当前视图命名", preferredStyle: .alert)
        alert.addTextField { $0.placeholder = "区域名称" }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(
          UIAlertAction(title: "保存", style: .default) { [weak self, weak alert] _ in
            self?.run(["op": "scene", "name": alert?.textFields?.first?.text ?? "区域"])
          })
        present(alert, animated: true)
      } else {
        run(["op": "addPage"])
      }
    }
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int)
      -> Int
    { items.count }
    func collectionView(
      _ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout,
      sizeForItemAt indexPath: IndexPath
    ) -> CGSize { CGSize(width: floor((collectionView.bounds.width - 8) / 2), height: 178) }
    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath)
      -> UICollectionViewCell
    {
      let cell =
        collectionView.dequeueReusableCell(withReuseIdentifier: "page", for: indexPath)
        as! NativePageCell
      let item = items[indexPath.item]
      let index = item["index"] as? Int ?? 0
      let selected = item["selected"] as? Bool ?? false
      let current = generation
      cell.represented = index
      cell.caption.text = item["title"] as? String
      cell.accessibilityLabel = cell.caption.text
      cell.accessibilityTraits = selected ? [.button, .selected] : [.button]
      cell.caption.textColor = selected ? .noteAccent : .noteText
      cell.backgroundColor = selected ? .noteSelected : .clear
      cell.thumbnail.image = nil
      if item["kind"] as? String == "scene" {
        cell.thumbnail.image = UIImage(systemName: "viewfinder")
      } else {
        thumbnail(index) { [weak self, weak cell] image in
          guard self?.generation == current, cell?.represented == index else { return }
          cell?.thumbnail.image = image
        }
      }
      return cell
    }
    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
      let item = items[indexPath.item]
      let index = item["index"] as? Int ?? 0
      run(
        item["kind"] as? String == "scene"
          ? ["op": "scene", "index": index] : ["op": "page", "index": index])
    }
  }

  /// The original Notes settings card, with native widgets placed by Rust's layout projection.
  final class NativeBrushSettingsController: UIViewController {
    private let state: [String: Any]
    private let change: ([String: Any]) -> UIImage?
    private let card = UIScrollView()
    private let cardShadow = UIView()
    private let preview = UIImageView()
    private let pressure = UIButton(type: .system)
    private var sliders: [String: UISlider] = [:]
    private var outputs: [String: UILabel] = [:]
    private var checked: Bool
    private let initialPreview: UIImage?
    init(state: [String: Any], preview: UIImage?, change: @escaping ([String: Any]) -> UIImage?) {
      self.state = state
      self.change = change
      self.checked = state["pressure"] as? Bool ?? true
      self.initialPreview = preview
      super.init(nibName: nil, bundle: nil)
      modalPresentationStyle = .overFullScreen
      modalTransitionStyle = .crossDissolve
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    private func label(
      _ text: String, frame: CGRect, size: CGFloat = 12, weight: UIFont.Weight = .regular,
      muted: Bool = false
    ) {
      let label = UILabel(frame: frame)
      label.text = text
      label.font = .systemFont(ofSize: size, weight: weight)
      label.textColor = muted ? .noteMuted : .noteText
      label.numberOfLines = 0
      card.addSubview(label)
    }
    override func loadView() {
      let outside = UIControl()
      outside.backgroundColor = .clear
      outside.addTarget(self, action: #selector(close), for: .touchUpInside)
      view = outside
    }
    override func viewDidLoad() {
      super.viewDidLoad()
      let panel = state["settingsPanel"] as? [String: Any] ?? [:]
      let box = panel["frame"] as? [String: Double] ?? [:]
      let width = box["width"] ?? 360
      card.backgroundColor = .notePanel
      card.layer.cornerRadius = 24
      card.layer.borderWidth = 1
      card.layer.borderColor = UIColor.noteBorder.cgColor
      card.accessibilityViewIsModal = true
      cardShadow.backgroundColor = .notePanel
      cardShadow.layer.cornerRadius = 24
      cardShadow.layer.shadowColor = UIColor(noteHex: "#15243d").cgColor
      cardShadow.layer.shadowOpacity = 0.125
      cardShadow.layer.shadowRadius = 16
      cardShadow.layer.shadowOffset = CGSize(width: 0, height: 4)
      view.addSubview(cardShadow)
      view.addSubview(card)
      card.contentSize = CGSize(width: width, height: panel["contentHeight"] as? Double ?? 375.5)
      label(
        "画笔设置", frame: CGRect(x: 17, y: 20.5, width: width - 100, height: 21), size: 14,
        weight: .semibold)
      let closeButton = UIButton(type: .system)
      closeButton.frame = CGRect(x: width - 53, y: 9, width: 44, height: 44)
      closeButton.setImage(
        UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 17)),
        for: .normal)
      closeButton.tintColor = UIColor.noteText
      closeButton.accessibilityLabel = "关闭"
      closeButton.addTarget(self, action: #selector(close), for: .touchUpInside)
      card.addSubview(closeButton)
      let previewBox = UIView(frame: CGRect(x: 17, y: 61, width: width - 34, height: 44))
      previewBox.backgroundColor = UIColor.noteHover
      previewBox.layer.cornerRadius = 12
      preview.image = initialPreview
      preview.contentMode = .scaleAspectFit
      preview.frame = CGRect(
        x: previewBox.bounds.width * 0.075, y: 2, width: previewBox.bounds.width * 0.85, height: 40)
      previewBox.addSubview(preview)
      card.addSubview(previewBox)
      label(
        "笔迹粗细", frame: CGRect(x: 17, y: 113, width: width - 34, height: 19.5), size: 13,
        weight: .semibold)
      for row in panel["rows"] as? [[String: Any]] ?? [] {
        let id = row["id"] as? String ?? ""
        let slider = UISlider()
        slider.frame = CGRect(
          x: row["x"] as? Double ?? 19, y: row["y"] as? Double ?? 140.5,
          width: row["width"] as? Double ?? 258, height: 44)
        slider.minimumValue = (row["min"] as? NSNumber)?.floatValue ?? 0
        slider.maximumValue = (row["max"] as? NSNumber)?.floatValue ?? 100
        slider.value = (row["value"] as? NSNumber)?.floatValue ?? 0
        slider.tintColor = UIColor.noteAccent
        slider.accessibilityLabel = row["label"] as? String
        let thumb = UIGraphicsImageRenderer(size: CGSize(width: 18, height: 18)).image { ctx in
          UIColor.white.setFill()
          UIBezierPath(ovalIn: CGRect(x: 1, y: 1, width: 16, height: 16)).fill()
          UIColor(noteHex: "#c5cbd2").setStroke()
          UIBezierPath(ovalIn: CGRect(x: 1, y: 1, width: 16, height: 16)).stroke()
        }
        slider.setThumbImage(thumb, for: .normal)
        slider.addTarget(self, action: #selector(changed), for: .valueChanged)
        sliders[id] = slider
        card.addSubview(slider)
        let output = UILabel(
          frame: CGRect(
            x: row["outputX"] as? Double ?? 291, y: slider.frame.minY + 12.25, width: 52,
            height: 19.5))
        output.font = .monospacedDigitSystemFont(ofSize: 13, weight: .regular)
        output.textColor = UIColor.noteMuted
        outputs[id] = output
        card.addSubview(output)
      }
      let brush = state["brush"] as? [String: Any] ?? [:]
      let hintY = panel["hintY"] as? Double ?? 198.5
      label(
        brush["hint"] as? String ?? "",
        frame: CGRect(x: 17, y: hintY, width: width - 34, height: 18), muted: true)
      pressure.frame = CGRect(
        x: 17, y: panel["pressureY"] as? Double ?? 228.5, width: width - 34, height: 44)
      pressure.contentHorizontalAlignment = .left
      pressure.titleLabel?.font = .systemFont(ofSize: 12)
      pressure.tintColor = UIColor.noteAccent
      pressure.setTitleColor(UIColor.noteText, for: .normal)
      pressure.setTitle("  压感", for: .normal)
      pressure.accessibilityLabel = "压感"
      pressure.isEnabled = panel["supportsPressure"] as? Bool ?? false
      pressure.addTarget(self, action: #selector(togglePressure), for: .touchUpInside)
      card.addSubview(pressure)
      if pressure.isEnabled {
        label(
          "手指：慢写粗、快写细；压感笔：轻写细、重写粗。",
          frame: CGRect(
            x: 17, y: panel["pressureHintY"] as? Double ?? 284.5, width: width - 34, height: 18),
          muted: true)
      }
      let done = UIButton(type: .system)
      done.frame = CGRect(
        x: width - 70.8, y: panel["footerY"] as? Double ?? 314.5, width: 53.8, height: 44)
      done.setTitle("完成", for: .normal)
      done.titleLabel?.font = .systemFont(ofSize: 14)
      done.tintColor = UIColor.noteText
      done.layer.cornerRadius = 8
      done.layer.borderWidth = 1
      done.layer.borderColor = UIColor.noteBorder.cgColor
      done.addTarget(self, action: #selector(close), for: .touchUpInside)
      card.addSubview(done)
      updateLabels()
    }
    override func viewDidLayoutSubviews() {
      super.viewDidLayoutSubviews()
      guard let panel = state["settingsPanel"] as? [String: Any],
        let box = panel["frame"] as? [String: Double]
      else { return }
      let origin = view.safeAreaLayoutGuide.layoutFrame.origin
      card.frame = CGRect(
        x: origin.x + (box["x"] ?? 12), y: origin.y + (box["y"] ?? 100), width: box["width"] ?? 360,
        height: box["height"] ?? 375.5)
      cardShadow.frame = card.frame
      cardShadow.layer.shadowPath =
        UIBezierPath(roundedRect: cardShadow.bounds, cornerRadius: 24).cgPath
    }
    @objc private func close() { dismiss(animated: !UIAccessibility.isReduceMotionEnabled) }
    @objc private func togglePressure() {
      checked.toggle()
      changed()
    }
    private func updateLabels() {
      for (id, slider) in sliders {
        outputs[id]?.text =
          id == "width"
          ? String(format: "%.1f pt", slider.value)
          : (id == "opacity"
            ? String(format: "%.0f%%", slider.value) : String(format: "%g", slider.value))
      }
      pressure.setImage(
        UIImage(
          systemName: checked && pressure.isEnabled ? "checkmark.square.fill" : "square",
          withConfiguration: UIImage.SymbolConfiguration(pointSize: 18)), for: .normal)
      pressure.accessibilityTraits = checked ? [.button, .selected] : [.button]
    }
    @objc private func changed() {
      let panel = state["settingsPanel"] as? [String: Any] ?? [:]
      for row in panel["rows"] as? [[String: Any]] ?? [] {
        let id = row["id"] as? String ?? ""
        let step = row["step"] as? Double ?? 1
        if let slider = sliders[id] {
          slider.value = Float((Double(slider.value) / step).rounded() * step)
        }
      }
      var settings: [String: Double] = [:]
      for (key, slider) in sliders where key != "width" && key != "opacity" {
        settings[key] = Double(slider.value)
      }
      updateLabels()
      preview.image = change([
        "op": "settings", "value": Double(sliders["width"]?.value ?? 2),
        "opacity": sliders["opacity"].map { Double($0.value) / 100 }
          ?? (state["opacity"] as? Double ?? 1), "pressure": checked && pressure.isEnabled,
        "settings": settings,
      ])
    }
  }
#endif

#if CUBE_NATIVE_NOTES
  /// Widget projection for the original notes action cards. Rust supplies every label/command/rect.
  final class NativeActionPanel: UIViewController {
    private var state: [String: Any]
    private let icon: (Int) -> UIImage?
    private let run: ([String: Any]) -> [String: Any]?
    private let host: ([String: Any]) -> Void
    private let card = UIScrollView(), shadow = UIView()
    private var sliderCommands: [ObjectIdentifier: [String: Any]] = [:]
    init(
      state: [String: Any], icon: @escaping (Int) -> UIImage?,
      run: @escaping ([String: Any]) -> [String: Any]?, host: @escaping ([String: Any]) -> Void
    ) {
      self.state = state
      self.icon = icon
      self.run = run
      self.host = host
      super.init(nibName: nil, bundle: nil)
      modalPresentationStyle = .overFullScreen
      modalTransitionStyle = .crossDissolve
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func loadView() {
      let outside = UIControl()
      outside.addTarget(self, action: #selector(close), for: .touchUpInside)
      view = outside
    }
    private var panel: [String: Any] { state["panel"] as? [String: Any] ?? [:] }
    override func viewDidLoad() {
      super.viewDidLoad()
      view.backgroundColor = .clear
      shadow.backgroundColor = .notePanel
      shadow.layer.cornerRadius = 24
      shadow.layer.shadowColor = UIColor(noteHex: "#15243d").cgColor
      shadow.layer.shadowOpacity = 0.125
      shadow.layer.shadowRadius = 16
      shadow.layer.shadowOffset = CGSize(width: 0, height: 4)
      view.addSubview(shadow)
      card.backgroundColor = .notePanel
      card.layer.cornerRadius = 24
      card.layer.borderWidth = 1
      card.layer.borderColor = UIColor.noteBorder.cgColor
      card.accessibilityViewIsModal = true
      view.addSubview(card)
      rebuild()
    }
    private func rebuild() {
      card.subviews.forEach { $0.removeFromSuperview() }
      sliderCommands.removeAll()
      let box = panel["frame"] as? [String: Double] ?? [:]
      let w = box["width"] ?? 360
      card.contentSize = CGSize(width: w, height: panel["contentHeight"] as? Double ?? 300)
      let title = UILabel(frame: CGRect(x: 17, y: 20.5, width: w - 80, height: 21))
      title.text = panel["title"] as? String
      title.font = .systemFont(ofSize: 14, weight: .semibold)
      title.textColor = .noteText
      title.isHidden = panel["compact"] as? Bool ?? false
      card.addSubview(title)
      let x = UIButton(type: .system)
      x.frame = CGRect(x: w - 53, y: 9, width: 44, height: 44)
      x.setImage(UIImage(systemName: "xmark"), for: .normal)
      x.tintColor = .noteText
      x.accessibilityLabel = "关闭"
      x.addTarget(self, action: #selector(close), for: .touchUpInside)
      x.isHidden = panel["compact"] as? Bool ?? false
      card.addSubview(x)
      for row in panel["rows"] as? [[String: Any]] ?? [] {
        guard let f = row["frame"] as? [String: Double] else { continue }
        let rect = CGRect(
          x: f["x"] ?? 17, y: f["y"] ?? 60, width: f["width"] ?? 150, height: f["height"] ?? 44)
        if row["type"] as? String == "section" {
          let label = UILabel(frame: rect)
          label.text = row["title"] as? String
          label.textColor = .noteMuted
          label.font = .systemFont(ofSize: 13)
          card.addSubview(label)
        } else if row["type"] as? String == "swatch" {
          let swatch = NativeSwatchButton(type: .custom)
          swatch.frame = rect
          swatch.swatch = UIColor(noteHex: row["color"] as? String ?? "#222b40")
          swatch.ring = row["selected"] as? Bool ?? false
          swatch.accessibilityLabel = "颜色 \(row["color"] as? String ?? "")"
          let command = row["command"] as? [String: Any] ?? [:]
          swatch.addAction(
            UIAction { [weak self] _ in self?.execute(command) }, for: .touchUpInside)
          card.addSubview(swatch)
        } else if row["type"] as? String == "slider" {
          let label = UILabel(
            frame: CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: 22))
          label.text = row["title"] as? String
          label.textColor = .noteText
          label.font = .systemFont(ofSize: 13)
          card.addSubview(label)
          let slider = UISlider(
            frame: CGRect(x: rect.minX, y: rect.minY + 24, width: rect.width - 66, height: 44))
          slider.minimumValue = (row["min"] as? NSNumber)?.floatValue ?? 0
          slider.maximumValue = (row["max"] as? NSNumber)?.floatValue ?? 1
          slider.value = (row["value"] as? NSNumber)?.floatValue ?? 0
          slider.tintColor = .noteAccent
          slider.accessibilityLabel = row["title"] as? String
          slider.isEnabled = row["enabled"] as? Bool ?? true
          let output = UILabel(
            frame: CGRect(x: rect.maxX - 60, y: rect.minY + 24, width: 60, height: 44))
          output.font = .monospacedDigitSystemFont(ofSize: 12, weight: .regular)
          output.textColor = .noteText
          output.textAlignment = .right
          card.addSubview(output)
          let field = row["field"] as? String ?? "value"
          func display(_ value: Float) -> String {
            field == "opacity"
              ? String(format: "%.0f%%", value * 100)
              : field == "angle" ? String(format: "%.0f°", value) : String(format: "%.1f pt", value)
          }
          output.text = display(slider.value)
          slider.addAction(
            UIAction { [weak slider, weak output] _ in
              if let slider {
                output?.text = display(slider.value)
                slider.accessibilityValue = output?.text
              }
            }, for: .valueChanged)
          var command = row["command"] as? [String: Any] ?? [:]
          command["_field"] = row["field"]
          sliderCommands[ObjectIdentifier(slider)] = command
          slider.addTarget(
            self, action: #selector(sliderFinished(_:)), for: [.touchUpInside, .touchUpOutside])
          card.addSubview(slider)
        } else {
          let button = UIButton(type: .custom)
          button.frame = rect
          button.layer.cornerRadius = 8
          button.layer.borderWidth = 1
          button.layer.borderColor = UIColor.noteBorder.cgColor
          button.backgroundColor = row["selected"] as? Bool == true ? .noteSelected : .notePanel
          button.isSelected = row["selected"] as? Bool ?? false
          button.accessibilityTraits = button.isSelected ? [.button, .selected] : [.button]
          button.isEnabled = row["enabled"] as? Bool ?? true
          button.alpha = button.isEnabled ? 1 : 0.3
          button.setTitle(row["title"] as? String, for: .normal)
          button.setTitleColor(.noteText, for: .normal)
          button.titleLabel?.font = .systemFont(ofSize: 13)
          button.titleLabel?.numberOfLines = 2
          if let hex = row["color"] as? String {
            button.backgroundColor = UIColor(noteHex: hex)
            button.setTitle("", for: .normal)
            button.accessibilityLabel = "颜色 \(hex)"
          }
          if let paper = row["paper"] as? String {
            let sample = NativePaperSample(
              frame: CGRect(x: 8, y: 8, width: rect.width - 16, height: 85))
            sample.paper = paper
            sample.isUserInteractionEnabled = false
            button.addSubview(sample)
            button.contentVerticalAlignment = .bottom
            button.contentEdgeInsets = UIEdgeInsets(top: 0, left: 0, bottom: 8, right: 0)
          }
          if row["type"] as? String == "layer" {
            button.contentHorizontalAlignment = .left
            button.contentEdgeInsets = UIEdgeInsets(top: 0, left: 12, bottom: 0, right: 55)
            let toggle = UIButton(type: .system)
            toggle.frame = CGRect(x: rect.width - 48, y: 0, width: 44, height: 44)
            toggle.setImage(
              UIImage(systemName: row["visible"] as? Bool == true ? "eye" : "eye.slash"),
              for: .normal)
            toggle.tintColor = .noteMuted
            toggle.accessibilityLabel = "切换图层可见性"
            let command = row["toggle"] as? [String: Any] ?? [:]
            toggle.addAction(
              UIAction { [weak self] _ in self?.execute(command) }, for: .touchUpInside)
            button.addSubview(toggle)
          }
          if row["type"] as? String == "eraserMode" {
            button.setTitle("", for: .normal)
            button.accessibilityLabel = row["title"] as? String
            button.layer.cornerRadius = 14
            let glyph = UIImageView(image: icon(row["icon"] as? Int ?? 212))
            glyph.frame = CGRect(x: 12, y: 12, width: 28, height: 28)
            glyph.tintColor = .noteText
            button.addSubview(glyph)
            let label = UILabel(frame: CGRect(x: 12, y: 48, width: rect.width - 24, height: 20))
            label.text = row["title"] as? String
            label.font = .systemFont(ofSize: 13, weight: .semibold)
            label.textColor = .noteText
            button.addSubview(label)
            let hint = UILabel(frame: CGRect(x: 12, y: 76, width: rect.width - 24, height: 24))
            hint.text = row["hint"] as? String
            hint.font = .systemFont(ofSize: 12)
            hint.textColor = .noteMuted
            hint.numberOfLines = 2
            button.addSubview(hint)
            button.subviews.forEach { $0.isUserInteractionEnabled = false }
          }
          if let id = row["icon"] as? Int, row["type"] as? String != "eraserMode" {
            button.layer.borderWidth = row["label"] == nil ? 0 : 1
            button.setImage(icon(id), for: .normal)
            button.tintColor = .noteText
            button.setTitle(row["label"] as? String, for: .normal)
            button.accessibilityLabel = row["title"] as? String
          }
          if row["type"] as? String == "width" {
            let bar = UIView(
              frame: CGRect(
                x: 8, y: rect.height / 2 - 2.5, width: 16,
                height: min(9, Double(row["value"] as? Double ?? 2))))
            bar.backgroundColor = .noteText
            bar.layer.cornerRadius = 3
            bar.isUserInteractionEnabled = false
            button.addSubview(bar)
            button.layer.borderWidth = 0
            button.titleLabel?.font = .systemFont(ofSize: 12)
            button.contentEdgeInsets = UIEdgeInsets(top: 0, left: 20, bottom: 0, right: 0)
          }
          let command = row["command"] as? [String: Any] ?? [:]
          button.addAction(
            UIAction { [weak self] _ in self?.execute(command) }, for: .touchUpInside)
          card.addSubview(button)
        }
      }
      let done = UIButton(type: .system)
      done.frame = CGRect(x: w - 71, y: panel["footerY"] as? Double ?? 240, width: 54, height: 44)
      done.setTitle("完成", for: .normal)
      done.tintColor = .noteText
      done.titleLabel?.font = .systemFont(ofSize: 14)
      done.layer.cornerRadius = 8
      done.layer.borderWidth = 1
      done.layer.borderColor = UIColor.noteBorder.cgColor
      done.addTarget(self, action: #selector(close), for: .touchUpInside)
      done.isHidden = panel["compact"] as? Bool ?? false
      card.addSubview(done)
      view.setNeedsLayout()
    }
    override func viewDidLayoutSubviews() {
      super.viewDidLayoutSubviews()
      let f = panel["frame"] as? [String: Double] ?? [:]
      let origin = view.safeAreaLayoutGuide.layoutFrame.origin
      card.frame = CGRect(
        x: origin.x + (f["x"] ?? 12), y: origin.y + (f["y"] ?? 100), width: f["width"] ?? 360,
        height: f["height"] ?? 300)
      shadow.frame = card.frame
      shadow.layer.shadowPath = UIBezierPath(roundedRect: shadow.bounds, cornerRadius: 24).cgPath
    }
    @objc private func close() { dismiss(animated: !UIAccessibility.isReduceMotionEnabled) }
    @objc private func sliderFinished(_ slider: UISlider) {
      guard var command = sliderCommands[ObjectIdentifier(slider)],
        let field = command.removeValue(forKey: "_field") as? String
      else { return }
      command[field] = Double(slider.value)
      execute(command)
    }
    private func execute(_ value: [String: Any]) {
      var value = value
      if value["confirm"] as? Bool == true {
        let alert = UIAlertController(title: "确认操作", message: "可以通过撤销恢复。", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        value.removeValue(forKey: "confirm")
        let confirmed = value
        alert.addAction(
          UIAlertAction(title: "确定", style: .destructive) { [weak self] _ in
            self?.execute(confirmed)
          })
        present(alert, animated: true)
        return
      }
      if value["host"] != nil {
        dismiss(animated: true) { [host] in host(value) }
        return
      }
      if value["op"] as? String != "panel" { value["panelName"] = panel["name"] }
      if let next = run(value) {
        state = next
        if value["close"] as? Bool == true { close() } else { rebuild() }
      }
    }
  }
  private final class NativePaperSample: UIView {
    var paper = "grid"
    override func draw(_ rect: CGRect) {
      guard let ctx = UIGraphicsGetCurrentContext() else { return }
      ctx.setFillColor(UIColor(noteHex: "#fffdf7").cgColor)
      ctx.fill(rect)
      ctx.setStrokeColor(UIColor(noteHex: "#cbd5e1").cgColor)
      ctx.setLineWidth(0.5)
      if paper == "grid" || paper == "ruled" {
        for y in stride(from: CGFloat(12), to: bounds.height, by: 12) {
          ctx.move(to: CGPoint(x: 0, y: y))
          ctx.addLine(to: CGPoint(x: bounds.width, y: y))
        }
        if paper == "grid" {
          for x in stride(from: CGFloat(12), to: bounds.width, by: 12) {
            ctx.move(to: CGPoint(x: x, y: 0))
            ctx.addLine(to: CGPoint(x: x, y: bounds.height))
          }
        }
        ctx.strokePath()
      }
      if paper == "dotted" {
        ctx.setFillColor(UIColor(noteHex: "#a8b6c9").cgColor)
        for x in stride(from: CGFloat(5), to: bounds.width, by: 10) {
          for y in stride(from: CGFloat(5), to: bounds.height, by: 10) {
            ctx.fillEllipse(in: CGRect(x: x, y: y, width: 1, height: 1))
          }
        }
      }
    }
  }
#endif
