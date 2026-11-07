import { Image } from 'expo-image';
import NativeFile from '@modules/native-file';
import { getString } from '@i18n/translations';
import { getNovelById } from '@database/queries/NovelQueries';
import {
  getDownloadedChapters,
  markChaptersNotDownloaded,
} from '@database/queries/ChapterQueries';
import type {
  DeletionResult,
  DeviceStorageUsage,
  DirectoryStats,
  NovelStorageUsage,
  StorageCategory,
  StorageCategoryId,
} from './types';
import {
  BACKUP_STAGING_DIR,
  BACKUP_STAGING_SOURCE_ZIP,
  BACKUP_STAGING_ZIP,
  CACHES_DIR,
  CRASH_LOGS_DIR,
  DATABASE_DIR,
  DOCUMENTS_DIR,
  NOVEL_STORAGE_DIR,
  PLUGIN_STORAGE_DIR,
  TEMP_DIR,
  WEBVIEW_CACHES_DIR,
  WEBVIEW_LIBRARY_DIR,
  assertInsideAppContainer,
  isBackupCacheName,
  isWebviewCacheName,
} from './storagePaths';
import {
  getActiveDownloadNovelIds,
  isAnyTaskActive,
  isBackupInProgress,
} from './activeTasks';
import { isRebuildableCategory } from './categories';

export { formatBytes } from './sizeFormat';
export { isRebuildableCategory };

const ZERO_STATS: DirectoryStats = {
  size: 0,
  files: 0,
  folders: 0,
  skipped: 0,
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// #region Measurement

/**
 * Measures a path that must be inside the app container. Missing paths are an
 * honest zero; native measurement failures propagate to the caller (the UI
 * shows an error state instead of a fake 0).
 */
export const measureStats = async (path: string): Promise<DirectoryStats> => {
  assertInsideAppContainer(path);
  if (typeof NativeFile.getDirectoryStats !== 'function') {
    throw new Error(
      'getDirectoryStats is not available on this platform — recursive measurement requires the native module',
    );
  }
  if (!(await NativeFile.exists(path))) {
    return ZERO_STATS;
  }
  return NativeFile.getDirectoryStats(path);
};

const sumStats = (stats: DirectoryStats[]): DirectoryStats =>
  stats.reduce(
    (acc, item) => ({
      size: acc.size + item.size,
      files: acc.files + item.files,
      folders: acc.folders + item.folders,
      skipped: acc.skipped + item.skipped,
    }),
    ZERO_STATS,
  );

type CacheChild = { name: string; path: string; isDirectory: boolean };

const listCachesChildren = async (): Promise<CacheChild[]> => {
  if (!(await NativeFile.exists(CACHES_DIR))) {
    return [];
  }
  const items = await NativeFile.readDir(CACHES_DIR);
  return items.map(item => ({
    name: item.name,
    path: item.path,
    isDirectory: item.isDirectory,
  }));
};

const measurePaths = async (paths: string[]): Promise<DirectoryStats> => {
  const stats: DirectoryStats[] = [];
  for (const path of paths) {
    stats.push(await measureStats(path));
  }
  return sumStats(stats);
};

export const getDeviceStorageUsage = async (): Promise<DeviceStorageUsage> => {
  if (typeof NativeFile.getDeviceStorageInfo !== 'function') {
    throw new Error(
      'getDeviceStorageInfo is not available on this platform — device volume info requires the native module',
    );
  }
  const info = await NativeFile.getDeviceStorageInfo();
  return {
    total: info.total,
    free: info.free,
    used: Math.max(0, info.total - info.free),
  };
};

/**
 * REAL measurements for every category. Category → path mapping:
 *  - downloads  <AppData>/Novels
 *  - images     <Caches>/* (excluding BackupData* and WebKit*)
 *  - databases  <Library>/default (lnreader.db + -wal/-shm) — never deleted
 *  - backups    <Caches>/BackupData{,.zip,-source.zip} (staging only; finished
 *               backups live at a user-picked destination outside the sandbox)
 *  - crashLogs  <Library>/CrashReports (empty on iOS today — the native crash
 *               module writes nothing into the sandbox)
 *  - temp       <home>/tmp
 *  - webview    <Caches>/WebKit + <Library>/WebKit (approximation: iOS has no
 *               public size API for WKWebsiteDataStore)
 *  - documents  <Documents> minus the Novels and Plugins subtrees
 */
export const measureCategories = async (): Promise<StorageCategory[]> => {
  const [
    downloadsStats,
    pluginsStats,
    documentsStats,
    databaseStats,
    tempStats,
    crashLogsStats,
    cachesChildren,
    webviewLibraryStats,
  ] = await Promise.all([
    measureStats(NOVEL_STORAGE_DIR),
    measureStats(PLUGIN_STORAGE_DIR),
    measureStats(DOCUMENTS_DIR),
    measureStats(DATABASE_DIR),
    measureStats(TEMP_DIR),
    measureStats(CRASH_LOGS_DIR),
    listCachesChildren(),
    measureStats(WEBVIEW_LIBRARY_DIR),
  ]);

  const webviewCachesChildren = cachesChildren.filter(child =>
    isWebviewCacheName(child.name),
  );
  const backupChildren = cachesChildren.filter(child =>
    isBackupCacheName(child.name),
  );
  const imageChildren = cachesChildren.filter(
    child => !isWebviewCacheName(child.name) && !isBackupCacheName(child.name),
  );

  const imagesStats = await measurePaths(
    imageChildren.map(child => child.path),
  );
  const webviewCachesStats = await measurePaths(
    webviewCachesChildren.map(child => child.path),
  );
  const backupsStats = await measurePaths(
    backupChildren.map(child => child.path),
  );

  const documentsBytes = Math.max(
    0,
    documentsStats.size - downloadsStats.size - pluginsStats.size,
  );

  const categories: StorageCategory[] = [
    {
      id: 'downloads',
      bytes: downloadsStats.size,
      files: downloadsStats.files,
      folders: downloadsStats.folders,
      skipped: downloadsStats.skipped,
      paths: [NOVEL_STORAGE_DIR],
      deletable: false,
    },
    {
      id: 'images',
      bytes: imagesStats.size,
      files: imagesStats.files,
      folders: imagesStats.folders,
      skipped: imagesStats.skipped,
      paths: imageChildren.map(child => child.path),
      deletable: true,
    },
    {
      id: 'databases',
      bytes: databaseStats.size,
      files: databaseStats.files,
      folders: databaseStats.folders,
      skipped: databaseStats.skipped,
      paths: [DATABASE_DIR],
      deletable: false,
    },
    {
      id: 'backups',
      bytes: backupsStats.size,
      files: backupsStats.files,
      folders: backupsStats.folders,
      skipped: backupsStats.skipped,
      paths: [
        BACKUP_STAGING_DIR,
        BACKUP_STAGING_ZIP,
        BACKUP_STAGING_SOURCE_ZIP,
      ],
      deletable: true,
    },
    {
      id: 'crashLogs',
      bytes: crashLogsStats.size,
      files: crashLogsStats.files,
      folders: crashLogsStats.folders,
      skipped: crashLogsStats.skipped,
      paths: [CRASH_LOGS_DIR],
      deletable: true,
    },
    {
      id: 'temp',
      bytes: tempStats.size,
      files: tempStats.files,
      folders: tempStats.folders,
      skipped: tempStats.skipped,
      paths: [TEMP_DIR],
      deletable: true,
    },
    {
      id: 'webview',
      bytes: webviewCachesStats.size + webviewLibraryStats.size,
      files: webviewCachesStats.files + webviewLibraryStats.files,
      folders: webviewCachesStats.folders + webviewLibraryStats.folders,
      skipped: webviewCachesStats.skipped + webviewLibraryStats.skipped,
      paths: [...webviewCachesChildren.map(c => c.path), WEBVIEW_LIBRARY_DIR],
      approximate: true,
      deletable: true,
    },
    {
      id: 'documents',
      bytes: documentsBytes,
      files: Math.max(
        0,
        documentsStats.files - downloadsStats.files - pluginsStats.files,
      ),
      folders: Math.max(
        0,
        documentsStats.folders - downloadsStats.folders - pluginsStats.folders,
      ),
      skipped: documentsStats.skipped,
      paths: [DOCUMENTS_DIR, NOVEL_STORAGE_DIR, PLUGIN_STORAGE_DIR],
      deletable: false,
    },
  ];

  return categories;
};

export const measureAppDataBytes = (categories: StorageCategory[]): number =>
  categories.reduce((total, category) => total + category.bytes, 0);

/** Per-novel breakdown of the downloads category, sorted by size. */
export const measureNovelDownloads = async (): Promise<NovelStorageUsage[]> => {
  const downloadedChapters = await getDownloadedChapters();

  const byNovel = new Map<
    number,
    { pluginId: string; name: string; chapters: number }
  >();
  for (const chapter of downloadedChapters) {
    const entry = byNovel.get(chapter.novelId) ?? {
      pluginId: chapter.pluginId,
      name: chapter.novelName,
      chapters: 0,
    };
    entry.chapters += 1;
    byNovel.set(chapter.novelId, entry);
  }

  const usage: NovelStorageUsage[] = [];
  for (const [novelId, info] of byNovel) {
    const novelDir = `${NOVEL_STORAGE_DIR}/${info.pluginId}/${novelId}`;
    const stats = await measureStats(novelDir);
    usage.push({
      novelId,
      pluginId: info.pluginId,
      name: info.name,
      chapters: info.chapters,
      bytes: stats.size,
    });
  }

  return usage.sort((a, b) => b.bytes - a.bytes);
};

// #endregion

// #region Deletion

const chapterDirPath = (
  pluginId: string,
  novelId: number,
  chapterId: number,
): string => `${NOVEL_STORAGE_DIR}/${pluginId}/${novelId}/${chapterId}`;

const assertNovelDeletionAllowed = (novelId: number): void => {
  if (getActiveDownloadNovelIds().has(novelId)) {
    throw new Error(getString('dataStorage.errors.downloadsInProgress'));
  }
  if (isBackupInProgress()) {
    throw new Error(getString('dataStorage.errors.backupInProgress'));
  }
};

type PathRemoval = {
  removed: string[];
  failed: { path: string; message: string }[];
};

/**
 * Removes paths inside the app container only (JS-side guard on every single
 * target, on top of the native guard). Missing paths count as removed — the
 * goal state is "gone".
 */
const removePaths = async (paths: string[]): Promise<PathRemoval> => {
  const removed: string[] = [];
  const failed: PathRemoval['failed'] = [];

  for (const path of paths) {
    assertInsideAppContainer(path);
    try {
      if (await NativeFile.exists(path)) {
        await NativeFile.unlink(path);
      }
      removed.push(path);
    } catch (error) {
      failed.push({ path, message: errorMessage(error) });
    }
  }

  return { removed, failed };
};

const allPathsRemoved = async (paths: string[]): Promise<boolean> => {
  for (const path of paths) {
    if (await NativeFile.exists(path)) {
      return false;
    }
  }
  return true;
};

const deletionResult = async (
  before: DirectoryStats,
  after: DirectoryStats,
  removal: PathRemoval,
  verifiedPaths: string[],
): Promise<DeletionResult> => ({
  freedBytes: Math.max(0, before.size - after.size),
  deletedCount: removal.removed.length,
  errors: removal.failed.map(failure => `${failure.path}: ${failure.message}`),
  verified:
    removal.failed.length === 0 && (await allPathsRemoved(verifiedPaths)),
});

const deleteChaptersCore = async (
  pluginId: string,
  novelId: number,
  chapterIds: number[],
): Promise<DeletionResult> => {
  const novelDir = `${NOVEL_STORAGE_DIR}/${pluginId}/${novelId}`;
  const before = await measureStats(novelDir);

  const targetPaths = chapterIds.map(chapterId =>
    chapterDirPath(pluginId, novelId, chapterId),
  );
  const removal = await removePaths(targetPaths);

  const failedPaths = new Set(removal.failed.map(failure => failure.path));
  const cleanChapterIds = chapterIds.filter(
    (_, index) => !failedPaths.has(targetPaths[index]),
  );
  if (cleanChapterIds.length) {
    // [10-C] file-only DB flip; the Novel.chaptersDownloaded column is kept
    // in sync by the update_novel_stats_on_update trigger.
    await markChaptersNotDownloaded(cleanChapterIds);
  }

  const after = await measureStats(novelDir);
  return deletionResult(before, after, removal, targetPaths);
};

const requireNovel = async (novelId: number) => {
  const novel = await getNovelById(novelId);
  if (!novel) {
    throw new Error(`Novel not found with id: ${novelId}`);
  }
  return novel;
};

/**
 * Deletes specific downloaded chapters of a novel (or all of them when
 * `chapterIds` is omitted), removes their folders under
 * `${NOVEL_STORAGE}/${pluginId}/${novelId}/` and flips `isDownloaded` in
 * SQLite. The library entry, progress and the novel's cover are kept.
 */
export const deleteNovelChapters = async (
  novelId: number,
  chapterIds?: number[],
): Promise<DeletionResult> => {
  assertNovelDeletionAllowed(novelId);
  const novel = await requireNovel(novelId);

  let targetIds: number[];
  if (chapterIds?.length) {
    targetIds = [...chapterIds];
  } else {
    const downloaded = await getDownloadedChapters();
    targetIds = downloaded
      .filter(chapter => chapter.novelId === novelId)
      .map(chapter => chapter.id);
  }

  if (!targetIds.length) {
    return { freedBytes: 0, deletedCount: 0, errors: [], verified: true };
  }

  return deleteChaptersCore(novel.pluginId, novelId, targetIds);
};

/**
 * Deletes every downloaded chapter of a novel — DB-downloaded chapters plus
 * any stale numeric chapter folders still on disk — while keeping the library
 * entry and the novel directory (cover.png lives there).
 */
export const deleteAllChaptersOfNovel = async (
  novelId: number,
): Promise<DeletionResult> => {
  assertNovelDeletionAllowed(novelId);
  const novel = await requireNovel(novelId);

  const downloaded = await getDownloadedChapters();
  const dbIds = downloaded
    .filter(chapter => chapter.novelId === novelId)
    .map(chapter => chapter.id);

  const novelDir = `${NOVEL_STORAGE_DIR}/${novel.pluginId}/${novelId}`;
  let diskIds: number[] = [];
  if (await NativeFile.exists(novelDir)) {
    const entries = await NativeFile.readDir(novelDir);
    diskIds = entries
      .filter(entry => entry.isDirectory && /^\d+$/.test(entry.name))
      .map(entry => Number(entry.name))
      .filter(entryId => Number.isFinite(entryId));
  }

  const targetIds = [...new Set([...dbIds, ...diskIds])];
  if (!targetIds.length) {
    return { freedBytes: 0, deletedCount: 0, errors: [], verified: true };
  }

  return deleteChaptersCore(novel.pluginId, novelId, targetIds);
};

/**
 * Deletes a rebuildable category. Refuses anything else — library DB rows,
 * settings, notes/highlights, history, the database files themselves and user
 * documents are never exposed through this API.
 */
export const deleteCategory = async (
  categoryId: StorageCategoryId,
): Promise<DeletionResult> => {
  if (!isRebuildableCategory(categoryId)) {
    throw new Error(getString('dataStorage.errors.categoryNotDeletable'));
  }
  if (isBackupInProgress()) {
    throw new Error(getString('dataStorage.errors.backupInProgress'));
  }
  if (categoryId === 'temp' && isAnyTaskActive()) {
    throw new Error(getString('dataStorage.errors.tasksInProgress'));
  }

  switch (categoryId) {
    case 'images':
      return deleteImagesCategory();
    case 'temp':
      return deleteTempCategory();
    case 'webview':
      return deleteWebviewCategory();
    case 'crashLogs':
      return deleteCrashLogsCategory();
    case 'backups':
      return deleteBackupsCategory();
    default:
      throw new Error(getString('dataStorage.errors.categoryNotDeletable'));
  }
};

const currentImageCacheChildren = async (): Promise<string[]> => {
  const children = await listCachesChildren();
  return children
    .filter(child => !isWebviewCacheName(child.name))
    .filter(child => !isBackupCacheName(child.name))
    .map(child => child.path);
};

const deleteImagesCategory = async (): Promise<DeletionResult> => {
  const targets = await currentImageCacheChildren();
  const before = await measurePaths(targets);

  const errors: string[] = [];
  try {
    // SDWebImage-backed expo-image disk cache (its own folder under Caches).
    await Image.clearDiskCache();
    await Image.clearMemoryCache();
  } catch (error) {
    errors.push(errorMessage(error));
  }

  const remainingTargets = await currentImageCacheChildren();
  const removal = await removePaths(remainingTargets);
  const afterTargets = await currentImageCacheChildren();
  const after = await measurePaths(afterTargets);

  return {
    ...(await deletionResult(before, after, removal, remainingTargets)),
    errors: [...errors, ...removal.failed.map(f => `${f.path}: ${f.message}`)],
    verified:
      removal.failed.length === 0 &&
      errors.length === 0 &&
      after.size === 0 &&
      (await allPathsRemoved(remainingTargets)),
  };
};

const deleteTempCategory = async (): Promise<DeletionResult> => {
  // Clear the contents, never the tmp directory itself.
  let childPaths: string[] = [];
  if (await NativeFile.exists(TEMP_DIR)) {
    childPaths = (await NativeFile.readDir(TEMP_DIR)).map(child => child.path);
  }
  const before = await measurePaths(childPaths);
  const removal = await removePaths(childPaths);
  const after = await measurePaths(childPaths);
  return deletionResult(before, after, removal, childPaths);
};

const deleteWebviewCategory = async (): Promise<DeletionResult> => {
  const cachesChildren = await listCachesChildren();
  const targets = [
    ...cachesChildren
      .filter(child => isWebviewCacheName(child.name))
      .map(c => c.path),
    WEBVIEW_CACHES_DIR,
    WEBVIEW_LIBRARY_DIR,
  ].filter((path, index, all) => all.indexOf(path) === index);

  const before = await measurePaths(targets);
  const errors: string[] = [];

  if (typeof NativeFile.clearWebViewWebsiteData === 'function') {
    try {
      await NativeFile.clearWebViewWebsiteData();
    } catch (error) {
      errors.push(errorMessage(error));
    }
  } else {
    errors.push('clearWebViewWebsiteData is not available on this platform');
  }

  const removal = await removePaths(targets);
  const after = await measurePaths(targets);
  const result = await deletionResult(before, after, removal, targets);
  return {
    ...result,
    errors: [...errors, ...result.errors],
    verified: result.verified && errors.length === 0,
  };
};

const deleteCrashLogsCategory = async (): Promise<DeletionResult> => {
  const targets = (await NativeFile.exists(CRASH_LOGS_DIR))
    ? [CRASH_LOGS_DIR]
    : [];
  const before = await measurePaths(targets);
  const removal = await removePaths(targets);
  const after = await measurePaths(targets);
  return deletionResult(before, after, removal, targets);
};

const deleteBackupsCategory = async (): Promise<DeletionResult> => {
  // Backup staging artifacts: the prepared folder, the final zip and the
  // downloaded source zip of a restore. Finished backups saved to a
  // user-picked destination are outside the sandbox and never touched.
  const candidates = [
    BACKUP_STAGING_DIR,
    BACKUP_STAGING_ZIP,
    BACKUP_STAGING_SOURCE_ZIP,
  ];

  const existingTargets: string[] = [];
  for (const path of candidates) {
    if (await NativeFile.exists(path)) {
      existingTargets.push(path);
    }
  }

  const before = await measurePaths(existingTargets);
  const removal = await removePaths(existingTargets);
  const after = await measurePaths(existingTargets);
  return deletionResult(before, after, removal, existingTargets);
};

// #endregion
