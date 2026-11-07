import NativeFile from '@modules/native-file';
import { NOVEL_STORAGE, PLUGIN_STORAGE } from '@utils/Storages';
import { CACHE_DIR_PATH } from '@services/backup/utils';

/**
 * Real container paths backing every Data & Storage category, plus the
 * JS-side container guard (defense in depth — the native module enforces the
 * same rule with symlink resolution).
 *
 * Ground truth:
 *  - NOVEL_STORAGE            <AppData>/Novels                      (downloaded chapters, covers)
 *  - PLUGIN_STORAGE           <AppData>/Documents/Plugins           (plugin files)
 *  - SQLite (op-sqlite, location 'default' on iOS): <home>/Library/default/lnreader.db (+ -wal/-shm)
 *  - Backup staging           <Caches>/BackupData{,.zip,-source.zip}
 *  - WebKit data              <Caches>/WebKit and <home>/Library/WebKit
 *  - Temp                     <home>/tmp (NSTemporaryDirectory)
 */

export const DOCUMENTS_DIR = NativeFile.DocumentDirectoryPath;
export const CACHES_DIR = NativeFile.ExternalCachesDirectoryPath;

/** The app sandbox home, derived from the Documents constant (`<home>/Documents`). */
export const APP_HOME_DIR = DOCUMENTS_DIR.replace(/\/Documents$/, '');
/** `<home>/Library` — hosts the SQLite `default/` folder and WebKit data. */
export const LIBRARY_DIR = `${APP_HOME_DIR}/Library`;

/** op-sqlite opens `{location: 'default'}` → `<Library>/default/lnreader.db`. */
export const DATABASE_DIR = `${LIBRARY_DIR}/default`;

/** App-local crash artifacts. The iOS NativeCrashLogs module currently writes
 * none (crash reports go to the OS), so this measures/cleans nothing unless a
 * future handler creates the folder. */
export const CRASH_LOGS_DIR = `${LIBRARY_DIR}/CrashReports`;

export const TEMP_DIR = NativeFile.TemporaryDirectoryPath;

/** Backup staging area — the only "backup" location inside the sandbox.
 * Finished backups live at a user-picked destination outside our reach. */
export const BACKUP_STAGING_DIR = CACHE_DIR_PATH;
export const BACKUP_STAGING_ZIP = `${CACHE_DIR_PATH}.zip`;
export const BACKUP_STAGING_SOURCE_ZIP = `${CACHE_DIR_PATH}-source.zip`;

export const WEBVIEW_CACHES_DIR = `${CACHES_DIR}/WebKit`;
export const WEBVIEW_LIBRARY_DIR = `${LIBRARY_DIR}/WebKit`;

/**
 * Removes `..`/`.` segments without touching the filesystem. Unlike the
 * native guard this cannot resolve symlinks — it only normalizes textual
 * traversal, which is exactly what a compromised/aggressive argument can
 * sneak in ('../../etc').
 */
export const normalizePath = (path: string): string => {
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join('/')}`;
};

/** true when `path` resolves inside the app container. */
export const isInsideAppContainer = (path: string): boolean => {
  if (!path || path.includes('\0')) {
    return false;
  }
  const normalized = normalizePath(path);
  return (
    normalized === APP_HOME_DIR || normalized.startsWith(`${APP_HOME_DIR}/`)
  );
};

/** Throws when a deletion/measurement target tries to escape the container. */
export const assertInsideAppContainer = (path: string): void => {
  if (!isInsideAppContainer(path)) {
    throw new Error(
      `Refusing to touch a path outside the app container: ${path}`,
    );
  }
};

/** Child paths of the Caches folder classified into rebuildable categories. */
export type CacheChild = { name: string; path: string; isDirectory: boolean };

/** Backup staging artifacts live directly in Caches: the `BackupData` folder,
 * `BackupData.zip` (final archive) and `BackupData-source.zip` (restore). */
export const isBackupCacheName = (name: string): boolean =>
  name === 'BackupData' || name.startsWith('BackupData');

export const isWebviewCacheName = (name: string): boolean =>
  name.toLowerCase().includes('webkit');

export const NOVEL_STORAGE_DIR = NOVEL_STORAGE;
export const PLUGIN_STORAGE_DIR = PLUGIN_STORAGE;
