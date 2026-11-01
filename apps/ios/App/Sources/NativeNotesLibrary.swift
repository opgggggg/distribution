#if CUBE_NATIVE_NOTES
  import UIKit

  /// OS file enumeration and widgets; the Rust projection owns gallery geometry.
  final class NativeNotesLibrary: UIViewController, UICollectionViewDataSource,
    UICollectionViewDelegateFlowLayout, UISearchBarDelegate
  {
    private let project: ([[String: Any]], CGSize) -> [String: Any]?
    private let thumbnail: (URL, @escaping (UIImage?) -> Void) -> Void
    private let open: (URL) -> Void
    private let create: () -> Void
    private let importFile: () -> Void
    private let removed: (URL) -> Void
    private let grid: UICollectionView
    private let titleLabel = UILabel(), empty = UILabel(), search = UISearchBar()
    private let add = UIButton(type: .system), device = UIButton(type: .system),
      back = UIButton(type: .system), trash = UIButton(type: .system)
    private var files: [URL] = [], visible: [URL] = [], layout: [String: Any] = [:]
    private var showingTrash = false
    private var cache: [URL: UIImage] = [:]
    private var generation = 0
    init(
      project: @escaping ([[String: Any]], CGSize) -> [String: Any]?,
      thumbnail: @escaping (URL, @escaping (UIImage?) -> Void) -> Void,
      open: @escaping (URL) -> Void, create: @escaping () -> Void, importFile: @escaping () -> Void,
      removed: @escaping (URL) -> Void
    ) {
      self.project = project
      self.thumbnail = thumbnail
      self.open = open
      self.create = create
      self.importFile = importFile
      self.removed = removed
      let flow = UICollectionViewFlowLayout()
      flow.minimumInteritemSpacing = 24
      flow.minimumLineSpacing = 28
      grid = UICollectionView(frame: .zero, collectionViewLayout: flow)
      super.init(nibName: nil, bundle: nil)
      modalPresentationStyle = .fullScreen
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    private var documents: URL {
      FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }
    private var trashURL: URL {
      documents.appendingPathComponent(".RecentlyDeleted", isDirectory: true)
    }
    override func viewDidLoad() {
      super.viewDidLoad()
      view.backgroundColor = .systemBackground
      titleLabel.font = .systemFont(ofSize: 28, weight: .semibold)
      titleLabel.textColor = .noteText
      view.addSubview(titleLabel)
      search.placeholder = "搜索文档名称"
      search.delegate = self
      search.searchBarStyle = .minimal
      view.addSubview(search)
      for (button, title, action) in [
        (back, "继续绘画", #selector(close)), (add, "＋ 新建", #selector(newNote)),
        (device, "从设备打开　›", #selector(importNote)), (trash, "最近删除", #selector(toggleTrash)),
      ] {
        button.setTitle(title, for: .normal)
        button.tintColor = .noteAccent
        button.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
        button.addTarget(self, action: action, for: .touchUpInside)
        view.addSubview(button)
      }
      add.backgroundColor = .noteAccent
      add.setTitleColor(.white, for: .normal)
      add.layer.cornerRadius = 12
      device.contentHorizontalAlignment = .left
      device.contentEdgeInsets = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
      device.backgroundColor = .noteHover
      device.layer.cornerRadius = 14
      grid.backgroundColor = .clear
      grid.dataSource = self
      grid.delegate = self
      grid.register(NativeLibraryCell.self, forCellWithReuseIdentifier: "note")
      view.addSubview(grid)
      empty.textColor = .noteMuted
      empty.font = .systemFont(ofSize: 15)
      empty.textAlignment = .center
      view.addSubview(empty)
      reload()
    }
    private func reload() {
      generation += 1
      let folder = showingTrash ? trashURL : documents
      files =
        ((try? FileManager.default.contentsOfDirectory(
          at: folder, includingPropertiesForKeys: [.contentModificationDateKey],
          options: .skipsHiddenFiles)) ?? []).filter { $0.pathExtension.lowercased() == "cubenote" }
        .sorted {
          ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)
            ?? .distantPast)
            > ((try? $1.resourceValues(forKeys: [.contentModificationDateKey])
              .contentModificationDate) ?? .distantPast)
        }
      filter()
    }
    private func filter() {
      let q = (search.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      visible = files.filter {
        q.isEmpty
          || $0.deletingPathExtension().lastPathComponent.localizedCaseInsensitiveContains(q)
      }
      titleLabel.text = showingTrash ? "最近删除" : "我的文件"
      trash.setTitle(showingTrash ? "返回文件" : "最近删除", for: .normal)
      add.isHidden = showingTrash
      device.isHidden = showingTrash
      empty.text = showingTrash ? "没有已删除的笔记" : "暂无笔记"
      empty.isHidden = !visible.isEmpty
      updateProjection()
      grid.reloadData()
      view.setNeedsLayout()
    }
    private func updateProjection() {
      if let result = project(
        visible.map {
          ["id": $0.lastPathComponent, "title": $0.deletingPathExtension().lastPathComponent]
        }, view.safeAreaLayoutGuide.layoutFrame.size)
      {
        layout = result
      }
    }
    override func viewDidLayoutSubviews() {
      super.viewDidLayoutSubviews()
      updateProjection()
      let area = view.safeAreaLayoutGuide.layoutFrame
      let w = area.width
      back.frame = CGRect(x: area.minX + 16, y: area.minY, width: 90, height: 44)
      trash.frame = CGRect(x: area.maxX - 110, y: area.minY, width: 94, height: 44)
      titleLabel.frame = CGRect(x: area.minX + 24, y: area.minY + 52, width: w - 170, height: 44)
      add.frame = CGRect(x: area.maxX - 116, y: area.minY + 50, width: 92, height: 48)
      search.frame = CGRect(x: area.minX + 16, y: area.minY + 108, width: w - 32, height: 52)
      device.frame = CGRect(x: area.minX + 24, y: area.minY + 172, width: w - 48, height: 52)
      let f = layout["grid"] as? [String: Double] ?? [:]
      grid.frame = CGRect(
        x: area.minX + (f["x"] ?? 24), y: area.minY + (f["y"] ?? 240), width: f["width"] ?? w - 48,
        height: f["height"] ?? area.height - 240)
      empty.frame = CGRect(
        x: grid.frame.minX, y: grid.frame.minY + 40, width: grid.frame.width, height: 44)
      grid.collectionViewLayout.invalidateLayout()
    }
    func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) { filter() }
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int)
      -> Int
    { visible.count }
    func collectionView(
      _ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout,
      sizeForItemAt indexPath: IndexPath
    ) -> CGSize {
      CGSize(
        width: layout["cardWidth"] as? Double ?? 180, height: layout["cardHeight"] as? Double ?? 180
      )
    }
    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath)
      -> UICollectionViewCell
    {
      let cell =
        collectionView.dequeueReusableCell(withReuseIdentifier: "note", for: indexPath)
        as! NativeLibraryCell
      let url = visible[indexPath.item]
      cell.url = url
      cell.preview.image = cache[url]
      cell.accessibilityLabel = url.deletingPathExtension().lastPathComponent
      cell.accessibilityTraits = .button
      if cache[url] == nil {
        let generation = self.generation
        thumbnail(url) { [weak self, weak cell] image in
          guard let self, self.generation == generation else { return }
          if self.cache.count > 48 { self.cache.removeAll() }
          self.cache[url] = image
          if cell?.url == url { cell?.preview.image = image }
        }
      }
      return cell
    }
    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
      let url = visible[indexPath.item]
      if showingTrash {
        move(url, toTrash: false)
      } else {
        dismiss(animated: true) { [open] in open(url) }
      }
    }
    func collectionView(
      _ collectionView: UICollectionView, contextMenuConfigurationForItemAt indexPath: IndexPath,
      point: CGPoint
    ) -> UIContextMenuConfiguration? {
      let url = visible[indexPath.item]
      let restore = showingTrash
      return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
        UIMenu(children: [
          UIAction(
            title: restore ? "恢复笔记" : "删除",
            image: UIImage(systemName: restore ? "arrow.uturn.backward" : "trash"),
            attributes: restore ? [] : .destructive
          ) { _ in self?.move(url, toTrash: !restore) }
        ])
      }
    }
    private func move(_ url: URL, toTrash: Bool) {
      do {
        let folder = toTrash ? trashURL : documents
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var destination = folder.appendingPathComponent(url.lastPathComponent)
        if FileManager.default.fileExists(atPath: destination.path) {
          destination = folder.appendingPathComponent(
            "\(url.deletingPathExtension().lastPathComponent)-\(UUID().uuidString.prefix(6)).cubenote"
          )
        }
        try FileManager.default.moveItem(at: url, to: destination)
        if toTrash { removed(url) }
        reload()
      } catch {
        let alert = UIAlertController(
          title: "无法移动文件", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default))
        present(alert, animated: true)
      }
    }
    @objc private func close() { dismiss(animated: true) }
    @objc private func newNote() { dismiss(animated: true, completion: create) }
    @objc private func importNote() { dismiss(animated: true, completion: importFile) }
    @objc private func toggleTrash() {
      showingTrash.toggle()
      reload()
    }
  }
  private final class NativeLibraryCell: UICollectionViewCell {
    let preview = UIImageView()
    var url: URL?
    override init(frame: CGRect) {
      super.init(frame: frame)
      contentView.backgroundColor = .noteHover
      contentView.layer.cornerRadius = 12
      contentView.clipsToBounds = true
      preview.contentMode = .scaleAspectFill
      preview.clipsToBounds = true
      contentView.addSubview(preview)
      isAccessibilityElement = true
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func layoutSubviews() {
      super.layoutSubviews()
      preview.frame = contentView.bounds
    }
    override func prepareForReuse() {
      super.prepareForReuse()
      url = nil
      preview.image = nil
    }
  }
#endif
