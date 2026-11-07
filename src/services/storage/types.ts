import type { DirectoryStats } from '@modules/native-file';

/**
 * Categories shown on the Data & Storage screen. Every one of them maps to a
 * real, measured location inside the app container — nothing is invented.
 */
export type StorageCategoryId =
  | 'downloads'
  | 'images'
  | 'databases'
  | 'backups'
  | 'crashLogs'
  | 'temp'
  | 'webview'
  | 'documents';

export type StorageCategory = {
  id: StorageCategoryId;
  bytes: number;
  files: number;
  folders: number;
  /** Entries the native walker could not read (permissions, broken links…). */
  skipped?: number;
  /** The concrete container paths that make up this measurement. */
  paths: string[];
  /**
   * true when the value is a lower bound (iOS exposes no size API for
   * WKWebsiteDataStore — the WebView category can only be cleared, and the
   * WebKit cache directories are measured as an approximation).
   */
  approximate?: boolean;
  /** true when deleteCategory() supports this id. */
  deletable: boolean;
};

export type DeviceStorageUsage = {
  total: number;
  free: number;
  used: number;
};

export type NovelStorageUsage = {
  novelId: number;
  pluginId: string;
  /** Novel name from the library database. */
  name: string;
  /** Number of chapters marked as downloaded in the database. */
  chapters: number;
  /** Measured bytes of `${NOVEL_STORAGE}/${pluginId}/${novelId}`. */
  bytes: number;
};

export type DeletionResult = {
  /** Real freed bytes: measured before − measured after. */
  freedBytes: number;
  /** Chapters / files / directories actually removed. */
  deletedCount: number;
  /** Human-readable errors — never swallowed. */
  errors: string[];
  /** true when a re-measure confirmed the targets are gone. */
  verified: boolean;
};

export type { DirectoryStats };
