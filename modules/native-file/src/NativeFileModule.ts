import { requireNativeModule } from 'expo-modules-core';

export type ReadDirResult = {
  name: string;
  path: string;
  isDirectory: boolean;
};

export type DirectorySelection = {
  uri: string;
  name: string;
};

export type FileCopyResult = {
  uri: string;
  size: number;
};

/** Recursive measurement result (bytes + entry counts). */
export type DirectoryStats = {
  size: number;
  files: number;
  folders: number;
  /** Entries that could not be read (permissions, broken symlinks…). */
  skipped: number;
};

/** Device volume information in bytes. */
export type DeviceStorageInfo = {
  total: number;
  free: number;
};

type NativeFileModule = {
  DocumentDirectoryPath: string;
  ExternalDirectoryPath: string;
  ExternalCachesDirectoryPath: string;
  /** iOS only: absolute path of the main app bundle. */
  BundlePath: string;
  /** iOS only: NSTemporaryDirectory(). */
  TemporaryDirectoryPath: string;
  createDocument(filename: string, mimeType: string): Promise<string>;
  pickDocument(mimeType: string): Promise<string>;
  pickDirectory(): Promise<DirectorySelection>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  copyFile(filepath: string, destPath: string): Promise<void>;
  copyFileToDirectory(
    sourcePath: string,
    directoryUri: string,
    fileName: string,
    mimeType: string,
    replace: boolean,
  ): Promise<FileCopyResult>;
  moveFile(filepath: string, destPath: string): Promise<void>;
  exists(filepath: string): Promise<boolean>;
  mkdir(filepath: string): Promise<void>;
  unlink(filepath: string): Promise<void>;
  readDir(directory: string): Promise<ReadDirResult[]>;
  downloadFile(
    url: string,
    destPath: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<void>;
  /**
   * iOS only: recursive byte/folder/file measurement of a directory that must
   * be inside the app container. Rejects for missing/outside-container paths.
   */
  getDirectoryStats(path: string): Promise<DirectoryStats>;
  /** iOS only: device volume {total, free} in bytes. */
  getDeviceStorageInfo(): Promise<DeviceStorageInfo>;
  /**
   * iOS only: clears every WKWebsiteDataStore data type (cookies, caches,
   * localStorage…). Signs the user out of in-app WebView sessions — callers
   * must show a dedicated warning first.
   */
  clearWebViewWebsiteData(): Promise<boolean>;
};

export default requireNativeModule<NativeFileModule>('NativeFile');
