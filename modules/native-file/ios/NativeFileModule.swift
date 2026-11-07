import ExpoModulesCore
import Foundation
import UniformTypeIdentifiers
import WebKit

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
 *  - Storage analytics + maintenance helpers for the Data & Storage settings
 *    screen (recursive directory stats, device volume info, WebView data wipe).
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

    /// Recursively measures a directory inside the app container.
    /// Returns {size: bytes, files, folders, skipped} where `skipped` counts
    /// entries the enumerator could not read (permissions, broken symlinks…)
    /// instead of failing the whole walk. Paths outside the app sandbox are
    /// rejected — measurement must never become an arbitrary-path probe.
    AsyncFunction("getDirectoryStats") { (path: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          // Security requirement: measurement is restricted to paths inside
          // the app container — no arbitrary-path probing.
          let containerURL = try self.requireAppContainerURL(path: path)
          try self.withSecurityScope(path: containerURL.path) { url in
            let stats = try self.computeDirectoryStats(url: url)
            promise.resolve(stats)
          }
        } catch {
          promise.reject("STATS_FAILED", error.localizedDescription)
        }
      }
    }

    /// Device volume information in bytes:
    /// {total: volumeTotalCapacity, free: volumeAvailableCapacityForImportantUsage}.
    AsyncFunction("getDeviceStorageInfo") { (promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let values = try URL(fileURLWithPath: "/").resourceValues(forKeys: [
            .volumeTotalCapacityKey,
            .volumeAvailableCapacityForImportantUsageKey,
          ])
          let total = values.volumeTotalCapacity ?? 0
          let free = values.volumeAvailableCapacityForImportantUsage ?? 0
          promise.resolve(["total": Double(total), "free": Double(free)])
        } catch {
          promise.reject(
            "STORAGE_INFO_FAILED",
            error.localizedDescription
          )
        }
      }
    }

    /// Clears all website data (cookies, caches, localStorage…) of the default
    /// WKWebsiteDataStore. NOTE: this signs the user out of every in-app
    /// WebView session — callers must warn separately before invoking it.
    AsyncFunction("clearWebViewWebsiteData") { (promise: Promise) in
      let dataTypes = WKWebsiteDataStore.allWebsiteDataTypes()
      WKWebsiteDataStore.default().removeData(
        ofTypes: dataTypes,
        modifiedSince: Date.distantPast
      ) {
        promise.resolve(true)
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

    /// iOS only: NSTemporaryDirectory() — measured/cleared by the
    /// Data & Storage screen.
    Constant("TemporaryDirectoryPath") {
      FileManager.default.temporaryDirectory.path
    }
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

  // MARK: - Storage analytics

  /// Resolves `path` and requires it to live inside the app container
  /// (NSHomeDirectory()-prefixed after symlink + dot-segment standardization).
  /// Used by the measurement API so it can never probe arbitrary paths.
  private func requireAppContainerURL(path: String) throws -> URL {
    let homeURL = URL(fileURLWithPath: NSHomeDirectory())
      .resolvingSymlinksInPath()
      .standardizedFileURL
    let targetURL = URL(fileURLWithPath: path)
      .resolvingSymlinksInPath()
      .standardizedFileURL

    guard targetURL.path == homeURL.path
      || targetURL.path.hasPrefix(homeURL.path + "/")
    else {
      throw NSError(
        domain: "NativeFile", code: 5,
        userInfo: [NSLocalizedDescriptionKey:
          "Path is outside the app container: \(path)"]
      )
    }
    return targetURL
  }

  /// Recursive walk of `url` returning byte/file/folder totals. Permission
  /// errors and unreadable entries are counted in `skipped` instead of
  /// failing the whole measurement.
  private func computeDirectoryStats(url: URL) throws -> [String: Any] {
    let fileManager = FileManager.default
    var isDirectory: ObjCBool = false
    guard fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
      throw NSError(
        domain: "NativeFile", code: 6,
        userInfo: [NSLocalizedDescriptionKey: "Path does not exist: \(url.path)"]
      )
    }

    if !isDirectory.boolValue {
      let fileBytes = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
      return ["size": Double(fileBytes), "files": 1, "folders": 0, "skipped": 0]
    }

    var size = 0.0
    var files = 0
    var folders = 0
    var skipped = 0

    let enumerator = fileManager.enumerator(
      at: url,
      includingPropertiesForKeys: [.isRegularFileKey, .isDirectoryKey, .fileSizeKey],
      options: [],
      errorHandler: { _, _ in
        // Count unreadable entries and keep walking.
        skipped += 1
        return true
      }
    )

    while let item = enumerator?.nextObject() as? URL {
      let values = try? item.resourceValues(forKeys: [.isRegularFileKey, .isDirectoryKey, .fileSizeKey])
      if let values = values {
        if values.isDirectory == true {
          folders += 1
          continue
        }
        if values.isRegularFile == true || values.isRegularFile == nil {
          files += 1
          size += Double(values.fileSize ?? 0)
          continue
        }
        // Non-file, non-directory entry (symlink to nowhere, socket…).
        skipped += 1
      } else {
        skipped += 1
      }
    }

    return [
      "size": size,
      "files": files,
      "folders": folders,
      "skipped": skipped,
    ]
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
