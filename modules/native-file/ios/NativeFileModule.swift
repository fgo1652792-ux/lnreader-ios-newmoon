import ExpoModulesCore
import Foundation
import UniformTypeIdentifiers

/**
 * iOS implementation of the NativeFile module.
 *
 * This file completes the iOS port of the Android module:
 *  - downloadFile: real URLSession-based downloader (method/headers/body/cookies).
 *  - createDocument / pickDocument / pickDirectory: UIDocumentPicker-based
 *    equivalents of the Android SAF flows.
 *  - BundlePath: absolute path of the app bundle (used by the reader WebView).
 *  - Security-scoped bookmark support so picked directories keep working
 *    across launches (mirrors Android's persisted SAF tree URIs).
 */
public class NativeFileModule: Module {
  /// UserDefaults suite storing security-scoped bookmarks keyed by path.
  private var bookmarksDefaults: UserDefaults? {
    UserDefaults(suiteName: "NativeFileBookmarks")
  }

  public func definition() -> ModuleDefinition {
    Name("NativeFile")

    Function("writeFile") { (path: String, content: String) in
      try self.withSecurityScope(path: path) { url in
        try content.write(to: url, atomically: true, encoding: .utf8)
      }
    }

    Function("readFile") { (path: String) in
      try self.withSecurityScope(path: path) { url in
        try String(contentsOf: url, encoding: .utf8)
      }
    }

    Function("copyFile") { (sourcePath: String, destPath: String) in
      let fileManager = FileManager.default
      let sourceURL = URL(fileURLWithPath: sourcePath)
      let destinationURL = URL(fileURLWithPath: destPath)

      if fileManager.fileExists(atPath: destinationURL.path) {
        try fileManager.removeItem(at: destinationURL)
      }
      try fileManager.copyItem(at: sourceURL, to: destinationURL)
    }

    AsyncFunction("copyFileToDirectory") { (sourcePath: String, directoryUri: String, fileName: String, mimeType: String, replace: Bool) -> [String: Any] in
      _ = mimeType
      return try self.withSecurityScope(path: directoryUri) { directory in
        try self.copyFileToDirectory(
          sourcePath: sourcePath,
          directoryUrl: directory,
          fileName: fileName,
          replace: replace
        )
      }
    }

    Function("moveFile") { (sourcePath: String, destPath: String) in
      let fileManager = FileManager.default
      let sourceURL = URL(fileURLWithPath: sourcePath)
      let destinationURL = URL(fileURLWithPath: destPath)

      if fileManager.fileExists(atPath: destinationURL.path) {
        try fileManager.removeItem(at: destinationURL)
      }
      try fileManager.moveItem(at: sourceURL, to: destinationURL)
    }

    Function("exists") { (filePath: String) in
      FileManager.default.fileExists(atPath: filePath)
    }

    Function("mkdir") { (filePath: String) in
      try FileManager.default.createDirectory(atPath: filePath, withIntermediateDirectories: true, attributes: nil)
    }

    Function("unlink") { (filePath: String) in
      try self.withSecurityScope(path: filePath) { url in
        try FileManager.default.removeItem(at: url)
      }
    }

    Function("readDir") { (dirPath: String) -> [[String: Any]] in
      let contents = try FileManager.default.contentsOfDirectory(atPath: dirPath)
      return contents.map { fileName in
        let path = (dirPath as NSString).appendingPathComponent(fileName)
        var isDirectory: ObjCBool = false
        FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory)
        return [
          "name": fileName,
          "path": path,
          "isDirectory": isDirectory.boolValue
        ]
      }
    }

    AsyncFunction("downloadFile") { (url: String, destPath: String, method: String, headers: [String: String], body: String?, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try self.downloadToFile(
            url: url,
            destPath: destPath,
            method: method,
            headers: headers,
            body: body
          )
          promise.resolve(nil)
        } catch {
          promise.reject("DOWNLOAD_FAILED", error.localizedDescription)
        }
      }
    }

    /// Creates a new empty document at a user-chosen location (equivalent of
    /// Android's ACTION_CREATE_DOCUMENT). Returns the file path to write into.
    /// NOTE: the modern iOS SDK (26.x) exposes `init(forExporting urls: [URL],
    /// asCopy: Bool)` — the UTType-based export initializer is gone — so we
    /// stage an empty temp file and let the export picker move it into place.
    /// The mimeType parameter is kept for TS API compatibility; the picker no
    /// longer enforces it natively.
    AsyncFunction("createDocument") { (filename: String, mimeType: String, promise: Promise) in
      DispatchQueue.main.async {
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        FileManager.default.createFile(atPath: tempURL.path, contents: Data())
        // iOS 26 SDK: nameFieldStringValue was removed from the public API.
        // The URL-based export picker suggests the staged file's name
        // automatically (the temp file is named after `filename`).
        let picker = UIDocumentPickerViewController(forExporting: [tempURL], asCopy: false)
        Self.presentPicker(picker) { urls in
          guard let url = urls.first else {
            try? FileManager.default.removeItem(at: tempURL)
            promise.reject("USER_CANCELED", "No document selected")
            return
          }
          self.storeBookmarkIfSecurityScoped(url)
          if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: Data())
          }
          try? FileManager.default.removeItem(at: tempURL)
          promise.resolve(url.path)
        }
      }
    }

    /// Opens a user-chosen document (equivalent of Android's ACTION_OPEN_DOCUMENT).
    /// Returns a readable file path.
    AsyncFunction("pickDocument") { (mimeType: String, promise: Promise) in
      DispatchQueue.main.async {
        let utType = Self.utType(forMimeType: mimeType) ?? .data
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [utType], asCopy: true)
        Self.presentPicker(picker) { urls in
          guard let url = urls.first else {
            promise.reject("USER_CANCELED", "No document selected")
            return
          }
          promise.resolve(url.path)
        }
      }
    }

    /// Opens a user-chosen directory (equivalent of Android's OPEN_DOCUMENT_TREE).
    /// Returns {uri, name}; access persists across launches via bookmarks.
    AsyncFunction("pickDirectory") { (promise: Promise) in
      DispatchQueue.main.async {
        let picker = UIDocumentPickerViewController(
          forOpeningContentTypes: [.folder],
          asCopy: false
        )
        Self.presentPicker(picker) { urls in
          guard let url = urls.first else {
            promise.reject("USER_CANCELED", "No directory selected")
            return
          }
          self.storeBookmarkIfSecurityScoped(url)
          promise.resolve(["uri": url.path, "name": url.lastPathComponent])
        }
      }
    }

    Constant("DocumentDirectoryPath") {
      let paths = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)
      return paths.first ?? ""
    }

    Constant("ExternalDirectoryPath") {
      let paths = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)
      return paths.first ?? ""
    }

    Constant("ExternalCachesDirectoryPath") {
      let paths = NSSearchPathForDirectoriesInDomains(.cachesDirectory, .userDomainMask, true)
      return paths.first ?? ""
    }

    Constant("BundlePath") {
      Bundle.main.bundlePath
    }

    // MARK: - App storage management (Data & Storage settings section)

    /// Full storage overview in ONE native pass: device capacities plus the
    /// recursive size of every measurable app-container category. Measuring
    /// runs off the JS thread; each category is independent, so one unreadable
    /// folder never fails the whole report (size 0 instead).
    AsyncFunction("getStorageInfo") { (promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        promise.resolve(self.collectStorageInfo())
      }
    }

    /// Recursive stats for one folder: bytes, file count, folder count.
    /// Confined to the app container.
    AsyncFunction("getDirectoryStats") { (path: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard Self.isInsideContainer(path) else {
          promise.reject("PATH_OUTSIDE_CONTAINER", "Refusing to measure outside the app container: \(path)")
          return
        }
        let stats = Self.recursiveStats(at: path)
        promise.resolve([
          "path": path,
          "bytes": stats.bytes,
          "files": stats.files,
          "folders": stats.folders,
          "exists": stats.exists,
        ])
      }
    }

    /// Deletes the CONTENTS of a folder (the folder itself survives —
    /// the app expects these paths to exist). Confined to the app container.
    /// Returns { deletedBytes, errors: [String] } so the UI can report real
    /// failures instead of fake success.
    AsyncFunction("deleteDirectoryContents") { (path: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard Self.isInsideContainer(path) else {
          promise.reject("PATH_OUTSIDE_CONTAINER", "Refusing to delete outside the app container: \(path)")
          return
        }
        let fileManager = FileManager.default
        var deletedBytes: Int64 = 0
        var errors: [String] = []
        let statsBefore = Self.recursiveStats(at: path)
        if let children = try? fileManager.contentsOfDirectory(atPath: path) {
          for child in children {
            let childPath = (path as NSString).appendingPathComponent(child)
            let childStats = Self.recursiveStats(at: childPath)
            do {
              try fileManager.removeItem(atPath: childPath)
              deletedBytes += childStats.bytes
            } catch {
              errors.append("\(child): \(error.localizedDescription)")
            }
          }
        }
        // Re-create the (now empty) folder so callers keep a valid path.
        try? fileManager.createDirectory(atPath: path, withIntermediateDirectories: true)
        _ = statsBefore
        promise.resolve(["deletedBytes": deletedBytes, "errors": errors])
      }
    }
  }

  // MARK: - Storage helpers

  /// True when `path` is inside THIS app's sandbox container. Every storage
  /// management operation is gated on this — no arbitrary filesystem deletes.
  static func isInsideContainer(_ path: String) -> Bool {
    let standardized = URL(fileURLWithPath: path).standardizedFileURL.path
    return standardized == NSHomeDirectory()
      || standardized.hasPrefix(NSHomeDirectory() + "/")
  }

  private struct DirStats {
    var bytes: Int64 = 0
    var files: Int64 = 0
    var folders: Int64 = 0
    var exists: Bool = false
  }

  /// Iterative deep walk (no recursion on the call stack for 1000+-chapter
  /// novel folders). Returns zero stats for missing paths.
  private static func recursiveStats(at path: String) -> DirStats {
    var result = DirStats()
    let fileManager = FileManager.default
    var isDirectory: ObjCBool = false
    guard fileManager.fileExists(atPath: path, isDirectory: &isDirectory) else {
      return result
    }
    result.exists = true
    if !isDirectory.boolValue {
      result.files = 1
      result.bytes = Self.fileSize(at: path)
      return result
    }
    result.folders = 1
    var stack: [String] = [path]
    while let dir = stack.popLast() {
      guard let children = try? fileManager.contentsOfDirectory(atPath: dir) else {
        continue
      }
      for child in children {
        let childPath = (dir as NSString).appendingPathComponent(child)
        var childIsDir: ObjCBool = false
        guard fileManager.fileExists(atPath: childPath, isDirectory: &childIsDir) else {
          continue
        }
        if childIsDir.boolValue {
          result.folders += 1
          stack.append(childPath)
        } else {
          result.files += 1
          result.bytes += Self.fileSize(at: childPath)
        }
      }
    }
    return result
  }

  private static func fileSize(at path: String) -> Int64 {
    let attributes = try? FileManager.default.attributesOfItem(atPath: path)
    return (attributes?[.size] as? NSNumber)?.int64Value ?? 0
  }

  private func collectStorageInfo() -> [String: Any] {
    let fileManager = FileManager.default
    let home = NSHomeDirectory()

    // Device capacities (whole volume — the app sandbox has no own quota).
    var totalBytes: Int64 = 0
    var freeBytes: Int64 = 0
    if let url = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first {
      let values = try? url.resourceValues(forKeys: [.volumeTotalCapacityKey, .volumeAvailableCapacityKey])
      totalBytes = Int64(values?.volumeTotalCapacity ?? 0)
      freeBytes = Int64(values?.volumeAvailableCapacity ?? 0)
    }

    let documents = (home as NSString).appendingPathComponent("Documents")
    let library = (home as NSString).appendingPathComponent("Library")
    let caches = (library as NSString).appendingPathComponent("Caches")
    let tmp = NSTemporaryDirectory()

    // Category paths (keep in sync with src/services/storage/storageService.ts)
    let categories: [String: String] = [
      "downloads": (documents as NSString).appendingPathComponent("Novels"),
      "plugins": (documents as NSString).appendingPathComponent("Plugins"),
      "caches": caches,
      "backups": (caches as NSString).appendingPathComponent("BackupData"),
      "webview": (library as NSString).appendingPathComponent("WebKit"),
      "crashLogs": (library as NSString).appendingPathComponent("Logs"),
      "databases": library,
      "temp": tmp,
    ]

    var measured: [String: Any] = [:]
    for (key, path) in categories {
      let stats = Self.recursiveStats(at: path)
      measured[key] = [
        "path": path,
        "bytes": stats.bytes,
        "files": stats.files,
        "folders": stats.folders,
        "exists": stats.exists,
      ]
    }

    // App container total (Documents + Library + tmp walked once).
    let containerStats = Self.recursiveStats(at: home)

    return [
      "deviceTotalBytes": totalBytes,
      "deviceFreeBytes": freeBytes,
      "containerBytes": containerStats.bytes,
      "categories": measured,
    ]
  }

  // MARK: - Copy to directory

  private func copyFileToDirectory(
    sourcePath: String,
    directoryUrl: URL,
    fileName: String,
    replace: Bool
  ) throws -> [String: Any] {
    guard !fileName.isEmpty,
      fileName != ".",
      fileName != "..",
      !fileName.contains("/"),
      !fileName.contains("\\")
    else {
      throw NSError(
        domain: "NativeFile",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Invalid destination file name"]
      )
    }

    let fileManager = FileManager.default
    let sourceURL = URL(fileURLWithPath: sourcePath)
    let destinationURL = directoryUrl.appendingPathComponent(fileName)
    let stagingURL = directoryUrl.appendingPathComponent(".\(fileName).\(UUID().uuidString).tmp")

    guard fileManager.fileExists(atPath: directoryUrl.path) else {
      throw NSError(
        domain: "NativeFile",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Destination directory does not exist"]
      )
    }
    if fileManager.fileExists(atPath: destinationURL.path) && !replace {
      throw CocoaError(.fileWriteFileExists)
    }

    defer { try? fileManager.removeItem(at: stagingURL) }
    try fileManager.copyItem(at: sourceURL, to: stagingURL)
    let attributes = try fileManager.attributesOfItem(atPath: stagingURL.path)
    let copiedSize = (attributes[.size] as? NSNumber)?.int64Value ?? 0

    if fileManager.fileExists(atPath: destinationURL.path) {
      _ = try fileManager.replaceItemAt(destinationURL, withItemAt: stagingURL)
    } else {
      try fileManager.moveItem(at: stagingURL, to: destinationURL)
    }
    return ["uri": destinationURL.absoluteString, "size": copiedSize]
  }

  // MARK: - Download

  private func downloadToFile(
    url: String,
    destPath: String,
    method: String,
    headers: [String: String],
    body: String?
  ) throws {
    guard let requestUrl = URL(string: url) else {
      throw NSError(
        domain: "NativeFile", code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Invalid URL: \(url)"]
      )
    }

    var request = URLRequest(url: requestUrl)
    request.httpMethod = method.uppercased()
    request.httpShouldHandleCookies = true
    headers.forEach { key, value in
      request.setValue(value, forHTTPHeaderField: key)
    }
    if let body = body, !body.isEmpty {
      request.httpBody = body.data(using: .utf8)
    }

    let semaphore = DispatchSemaphore(value: 0)
    var resultData: Data?
    var resultError: Error?
    var statusCode = 0

    // .default configuration shares HTTPCookieStorage with RN networking,
    // so cookies collected by the app/webview are reused (mirrors the
    // Android OkHttp cookie jar behaviour).
    let task = URLSession.shared.dataTask(with: request) { data, response, error in
      defer { semaphore.signal() }
      resultError = error
      resultData = data
      if let http = response as? HTTPURLResponse {
        statusCode = http.statusCode
      }
    }
    task.resume()
    semaphore.wait()

    if let error = resultError {
      throw error
    }
    guard let data = resultData, statusCode == 200 else {
      throw NSError(
        domain: "NativeFile", code: 4,
        userInfo: [NSLocalizedDescriptionKey: "Network request failed (HTTP \(statusCode))"]
      )
    }

    let destinationURL = URL(fileURLWithPath: destPath)
    let parentDirectory = destinationURL.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: parentDirectory, withIntermediateDirectories: true)
    try data.write(to: destinationURL, options: .atomic)
  }

  // MARK: - Security-scoped bookmarks

  private func storeBookmarkIfSecurityScoped(_ url: URL) {
    let needsBookmark = url.path.starts(with: "/private/var/mobile")
      || url.path.starts(with: "/var/mobile")
    guard needsBookmark else {
      return
    }
    do {
      let bookmark = try url.bookmarkData()
      bookmarksDefaults?.set(bookmark, forKey: url.path)
    } catch {
      // Non-fatal: some locations remain accessible without a bookmark.
    }
  }

  private func resolveSecurityScopedURL(for path: String) -> URL? {
    let url = URL(fileURLWithPath: path)
    if FileManager.default.fileExists(atPath: path) {
      return url
    }
    // The file itself may not exist yet (e.g. creating a new file inside a
    // picked directory) — fall back to the closest bookmarked ancestor.
    var candidate = url.deletingLastPathComponent()
    while candidate.path.count > 1 {
      if let bookmark = bookmarksDefaults?.data(forKey: candidate.path) {
        return resolveBookmark(bookmark, forKey: candidate.path)
      }
      let parent = candidate.deletingLastPathComponent()
      if parent.path == candidate.path {
        break
      }
      candidate = parent
    }
    guard let bookmark = bookmarksDefaults?.data(forKey: path) else {
      return nil
    }
    return resolveBookmark(bookmark, forKey: path)
  }

  private func resolveBookmark(_ bookmark: Data, forKey key: String) -> URL? {
    var isStale = false
    do {
      let resolved = try URL(
        resolvingBookmarkData: bookmark,
        options: [],
        relativeTo: nil,
        bookmarkDataIsStale: &isStale
      )
      if isStale {
        if let refreshed = try? resolved.bookmarkData() {
          bookmarksDefaults?.set(refreshed, forKey: key)
        }
      }
      return resolved
    } catch {
      return nil
    }
  }

  /// Runs `body` with security scope started when the path belongs to a
  /// user-picked (sandboxed) location. Plain container paths run untouched.
  private func withSecurityScope<T>(path: String, body: (URL) throws -> T) throws -> T {
    let url = URL(fileURLWithPath: path)
    let scoped = resolveSecurityScopedURL(for: path)
    var started = false
    if let scoped = scoped {
      started = scoped.startAccessingSecurityScopedResource()
    }
    defer {
      if started {
        scoped?.stopAccessingSecurityScopedResource()
      }
    }
    return try body(url)
  }

  // MARK: - Picker presentation

  private static func utType(forMimeType mimeType: String) -> UTType? {
    if mimeType.isEmpty || mimeType == "*/*" {
      return .data
    }
    return UTType(mimeType: mimeType)
      ?? UTType(filenameExtension: (mimeType as NSString).pathExtension)
  }

  private static func presentPicker(
    _ picker: UIDocumentPickerViewController,
    completion: @escaping ([URL]) -> Void
  ) {
    let delegate = PickerDelegateHolder(completion: completion)
    picker.delegate = delegate
    objc_setAssociatedObject(
      picker,
      &PickerDelegateHolder.associationKey,
      delegate,
      .OBJC_ASSOCIATION_RETAIN
    )
    picker.allowsMultipleSelection = false

    let rootViewController = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first(where: { $0.isKeyWindow })?
      .rootViewController
    if let rootViewController = rootViewController {
      var presenter = rootViewController
      while let next = presenter.presentedViewController {
        presenter = next
      }
      presenter.present(picker, animated: true)
    } else {
      completion([])
    }
  }
}

/// Retains itself on the picker via associated objects and forwards the result.
final class PickerDelegateHolder: NSObject, UIDocumentPickerDelegate {
  static var associationKey = "NativeFilePickerDelegate"

  private let completion: ([URL]) -> Void

  init(completion: @escaping ([URL]) -> Void) {
    self.completion = completion
    super.init()
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    completion(urls)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    completion([])
  }
}
