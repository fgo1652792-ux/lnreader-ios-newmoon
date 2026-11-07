import NativeFile, {
  type DirectoryStats,
  type ReadDirResult,
} from '@modules/native-file';
import { Image } from 'expo-image';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import {
  getDownloadedChapters,
  markChaptersNotDownloaded,
} from '@database/queries/ChapterQueries';
import { getNovelById } from '@database/queries/NovelQueries';

import {
  deleteAllChaptersOfNovel,
  deleteCategory,
  deleteNovelChapters,
  getDeviceStorageUsage,
  measureCategories,
  measureNovelDownloads,
  measureStats,
} from '../storageService';
import {
  assertInsideAppContainer,
  isInsideAppContainer,
  normalizePath,
} from '../storagePaths';
import { isRebuildableCategory } from '../categories';

jest.mock('@modules/native-file', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/mock/home/Documents',
    ExternalDirectoryPath: '/mock/home/Documents',
    ExternalCachesDirectoryPath: '/mock/home/Library/Caches',
    TemporaryDirectoryPath: '/mock/home/tmp',
    BundlePath: '/mock/app',
    exists: jest.fn(),
    readDir: jest.fn(),
    unlink: jest.fn(),
    getDirectoryStats: jest.fn(),
    getDeviceStorageInfo: jest.fn(),
    clearWebViewWebsiteData: jest.fn(),
  },
}));

jest.mock('expo-image', () => ({
  Image: {
    clearDiskCache: jest.fn(),
    clearMemoryCache: jest.fn(),
  },
}));

jest.mock('@utils/mmkv/mmkv', () => ({
  getMMKVObject: jest.fn(),
  setMMKVObject: jest.fn(),
  MMKVStorage: {},
}));

jest.mock('@database/queries/ChapterQueries', () => ({
  getDownloadedChapters: jest.fn(),
  markChaptersNotDownloaded: jest.fn(),
}));

jest.mock('@database/queries/NovelQueries', () => ({
  getNovelById: jest.fn(),
}));

jest.mock('@i18n/translations', () => ({
  getString: jest.fn((key: string) => key),
}));

jest.mock('@services/backup/utils', () => ({
  CACHE_DIR_PATH: '/mock/home/Library/Caches/BackupData',
}));

const DOCUMENTS = '/mock/home/Documents';
const CACHES = '/mock/home/Library/Caches';
const LIBRARY = '/mock/home/Library';
const NOVEL_STORAGE = `${DOCUMENTS}/Novels`;
const DATABASE_DIR = `${LIBRARY}/default`;
const TEMP_DIR = '/mock/home/tmp';
const BACKUP_DIR = `${CACHES}/BackupData`;

const ZERO: DirectoryStats = { size: 0, files: 0, folders: 0, skipped: 0 };

const entry = (
  name: string,
  path: string,
  isDirectory: boolean,
): ReadDirResult => ({ name, path, isDirectory });

let presentPaths: Set<string>;
let directoryStats: Map<string, DirectoryStats>;
let dirEntries: Map<string, ReadDirResult[]>;

const mockQueue = (tasks: unknown[]) =>
  (getMMKVObject as jest.Mock).mockReturnValue(tasks);

const queueEntry = (name: string, data: unknown) => ({
  id: 'task-1',
  state: 'running',
  task: { name, data },
  meta: {
    name: 'task',
    isRunning: true,
    progress: undefined,
    progressText: '',
  },
});

beforeEach(() => {
  // The root jest config's clearMocks does not reach per-project mocks
  // reliably here — reset call history explicitly.
  jest.clearAllMocks();

  presentPaths = new Set<string>();
  directoryStats = new Map<string, DirectoryStats>();
  dirEntries = new Map<string, ReadDirResult[]>();

  (NativeFile.exists as jest.Mock).mockImplementation((path: string) =>
    Promise.resolve(presentPaths.has(path)),
  );
  (NativeFile.unlink as jest.Mock).mockImplementation(async (path: string) => {
    if (!presentPaths.has(path)) {
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }
    presentPaths.delete(path);
  });
  (NativeFile.readDir as jest.Mock).mockImplementation((path: string) =>
    Promise.resolve(dirEntries.get(path) ?? []),
  );
  (NativeFile.getDirectoryStats as jest.Mock).mockImplementation(
    async (path: string) => directoryStats.get(path) ?? { ...ZERO },
  );
  (NativeFile.getDeviceStorageInfo as jest.Mock).mockResolvedValue({
    total: 0,
    free: 0,
  });
  (NativeFile.clearWebViewWebsiteData as jest.Mock).mockResolvedValue(true);
  (Image.clearDiskCache as jest.Mock).mockResolvedValue(undefined);
  (Image.clearMemoryCache as jest.Mock).mockResolvedValue(undefined);
  mockQueue([]);
  (getDownloadedChapters as jest.Mock).mockResolvedValue([]);
  (markChaptersNotDownloaded as jest.Mock).mockResolvedValue(undefined);
  (getNovelById as jest.Mock).mockReturnValue(undefined);
});

describe('storagePaths container guard', () => {
  it('accepts paths inside the app container', () => {
    expect(isInsideAppContainer('/mock/home/Documents/Novels')).toBe(true);
    expect(isInsideAppContainer('/mock/home/tmp')).toBe(true);
    expect(isInsideAppContainer('/mock/home')).toBe(true);
  });

  it('rejects traversal outside the container', () => {
    expect(isInsideAppContainer('../../etc/passwd')).toBe(false);
    expect(isInsideAppContainer('/etc')).toBe(false);
    expect(isInsideAppContainer('/mock/homeevil')).toBe(false);
    expect(() => assertInsideAppContainer('../../etc')).toThrow(
      /outside the app container/,
    );
  });

  it('normalizes dot segments before checking', () => {
    expect(normalizePath('/mock/home/../home/Library/./default')).toBe(
      '/mock/home/Library/default',
    );
    expect(normalizePath('/mock/home/Documents/Novels/../../../../etc/7')).toBe(
      '/etc/7',
    );
  });
});

describe('measureStats', () => {
  it('rejects paths outside the app container', async () => {
    await expect(measureStats('/etc')).rejects.toThrow(
      /outside the app container/,
    );
  });

  it('returns an honest zero for missing paths without calling native stats', async () => {
    const stats = await measureStats(`${NOVEL_STORAGE}/multi/7`);
    expect(stats).toEqual(ZERO);
    expect(NativeFile.getDirectoryStats).not.toHaveBeenCalled();
  });
});

describe('getDeviceStorageUsage', () => {
  it('derives used bytes from the real volume info', async () => {
    (NativeFile.getDeviceStorageInfo as jest.Mock).mockResolvedValue({
      total: 268435456000,
      free: 107374182400,
    });
    const usage = await getDeviceStorageUsage();
    expect(usage).toEqual({
      total: 268435456000,
      free: 107374182400,
      used: 161061273600,
    });
  });
});

describe('measureCategories', () => {
  it('returns zeroed categories when nothing exists on disk', async () => {
    const categories = await measureCategories();

    expect(categories).toHaveLength(8);
    for (const category of categories) {
      expect(category.bytes).toBe(0);
    }
    expect(
      categories.find(category => category.id === 'downloads')?.paths,
    ).toEqual([NOVEL_STORAGE]);
    expect(NativeFile.getDirectoryStats).not.toHaveBeenCalled();
  });

  it('measures every category from its real container paths', async () => {
    const documents = DOCUMENTS;
    const novels = NOVEL_STORAGE;
    const plugins = `${DOCUMENTS}/Plugins`;
    const sdwebImage = `${CACHES}/com.hackemist.SDWebImageCache.default`;
    const otherCache = `${CACHES}/OtherCache`;
    const webkitCaches = `${CACHES}/WebKit`;
    const webkitLibrary = `${LIBRARY}/WebKit`;

    [
      documents,
      novels,
      plugins,
      DATABASE_DIR,
      TEMP_DIR,
      `${LIBRARY}/CrashReports`,
    ].forEach(path => presentPaths.add(path));

    const cacheChildren: ReadDirResult[] = [
      entry('com.hackemist.SDWebImageCache.default', sdwebImage, true),
      entry('OtherCache', otherCache, true),
      entry('WebKit', webkitCaches, true),
      entry('BackupData', BACKUP_DIR, true),
      entry('BackupData.zip', `${BACKUP_DIR}.zip`, false),
      entry('BackupData-source.zip', `${BACKUP_DIR}-source.zip`, false),
    ];
    dirEntries.set(CACHES, cacheChildren);
    presentPaths.add(CACHES);
    cacheChildren.forEach(child => presentPaths.add(child.path));
    presentPaths.add(webkitLibrary);

    directoryStats.set(documents, {
      size: 3000,
      files: 30,
      folders: 5,
      skipped: 0,
    });
    directoryStats.set(novels, {
      size: 1000,
      files: 10,
      folders: 3,
      skipped: 0,
    });
    directoryStats.set(plugins, {
      size: 150,
      files: 2,
      folders: 1,
      skipped: 0,
    });
    directoryStats.set(DATABASE_DIR, {
      size: 500,
      files: 3,
      folders: 0,
      skipped: 0,
    });
    directoryStats.set(TEMP_DIR, {
      size: 40,
      files: 4,
      folders: 0,
      skipped: 0,
    });
    directoryStats.set(sdwebImage, {
      size: 300,
      files: 9,
      folders: 1,
      skipped: 0,
    });
    directoryStats.set(otherCache, {
      size: 70,
      files: 2,
      folders: 0,
      skipped: 0,
    });
    directoryStats.set(webkitCaches, {
      size: 200,
      files: 5,
      folders: 1,
      skipped: 0,
    });
    directoryStats.set(webkitLibrary, {
      size: 50,
      files: 1,
      folders: 1,
      skipped: 0,
    });
    directoryStats.set(BACKUP_DIR, {
      size: 100,
      files: 3,
      folders: 0,
      skipped: 0,
    });
    directoryStats.set(`${BACKUP_DIR}.zip`, {
      size: 20,
      files: 1,
      folders: 0,
      skipped: 0,
    });
    directoryStats.set(`${BACKUP_DIR}-source.zip`, {
      size: 10,
      files: 1,
      folders: 0,
      skipped: 0,
    });

    const categories = await measureCategories();
    const byId = Object.fromEntries(categories.map(c => [c.id, c]));

    expect(byId.downloads.bytes).toBe(1000);
    expect(byId.images.bytes).toBe(370); // SDWebImage + OtherCache only
    expect(byId.images.paths).toEqual([sdwebImage, otherCache]);
    expect(byId.databases.bytes).toBe(500);
    expect(byId.backups.bytes).toBe(130); // BackupData + .zip + -source.zip
    expect(byId.crashLogs.bytes).toBe(0);
    expect(byId.temp.bytes).toBe(40);
    expect(byId.webview.bytes).toBe(250); // Caches/WebKit + Library/WebKit
    expect(byId.webview.approximate).toBe(true);
    expect(byId.documents.bytes).toBe(1850); // 3000 - 1000 - 150

    // Deletability contract
    expect(byId.databases.deletable).toBe(false);
    expect(byId.documents.deletable).toBe(false);
    expect(byId.downloads.deletable).toBe(false);
    expect(byId.images.deletable).toBe(true);
    expect(byId.webview.deletable).toBe(true);
  });
});

describe('measureNovelDownloads', () => {
  it('groups downloaded chapters per novel with real measured bytes', async () => {
    (getDownloadedChapters as jest.Mock).mockResolvedValue([
      { id: 1, novelId: 7, pluginId: 'multi', novelName: 'Novel Seven' },
      { id: 2, novelId: 7, pluginId: 'multi', novelName: 'Novel Seven' },
      { id: 5, novelId: 9, pluginId: 'other', novelName: 'Other' },
    ]);
    presentPaths.add(`${NOVEL_STORAGE}/multi/7`);
    presentPaths.add(`${NOVEL_STORAGE}/other/9`);
    directoryStats.set(`${NOVEL_STORAGE}/multi/7`, {
      size: 777,
      files: 6,
      folders: 2,
      skipped: 0,
    });
    directoryStats.set(`${NOVEL_STORAGE}/other/9`, {
      size: 900,
      files: 8,
      folders: 1,
      skipped: 0,
    });

    const usage = await measureNovelDownloads();

    expect(usage).toEqual([
      {
        novelId: 9,
        pluginId: 'other',
        name: 'Other',
        chapters: 1,
        bytes: 900,
      },
      {
        novelId: 7,
        pluginId: 'multi',
        name: 'Novel Seven',
        chapters: 2,
        bytes: 777,
      },
    ]);
  });

  it('reports 0 bytes when the novel folder is missing but the DB says downloaded', async () => {
    (getDownloadedChapters as jest.Mock).mockResolvedValue([
      { id: 1, novelId: 7, pluginId: 'multi', novelName: 'Novel Seven' },
    ]);

    const usage = await measureNovelDownloads();
    expect(usage).toEqual([
      {
        novelId: 7,
        pluginId: 'multi',
        name: 'Novel Seven',
        chapters: 1,
        bytes: 0,
      },
    ]);
  });
});

describe('deleteNovelChapters', () => {
  const novelDir = `${NOVEL_STORAGE}/multi/7`;
  const chapter11 = `${novelDir}/11`;
  const chapter12 = `${novelDir}/12`;

  beforeEach(() => {
    (getNovelById as jest.Mock).mockImplementation((novelId: number) =>
      novelId === 7
        ? { id: 7, pluginId: 'multi', name: 'Novel Seven' }
        : undefined,
    );
  });

  it('deletes the chapter folders, flips the DB flag and verifies', async () => {
    [novelDir, chapter11, chapter12].forEach(path => presentPaths.add(path));
    (NativeFile.getDirectoryStats as jest.Mock).mockImplementation(
      async (path: string) => {
        if (path !== novelDir) {
          return directoryStats.get(path) ?? { ...ZERO };
        }
        const size =
          500 +
          (presentPaths.has(chapter11) ? 200 : 0) +
          (presentPaths.has(chapter12) ? 300 : 0);
        return { size, files: 3, folders: 2, skipped: 0 };
      },
    );

    const result = await deleteNovelChapters(7, [11, 12]);

    expect(NativeFile.unlink).toHaveBeenCalledWith(chapter11);
    expect(NativeFile.unlink).toHaveBeenCalledWith(chapter12);
    expect(markChaptersNotDownloaded).toHaveBeenCalledWith([11, 12]);
    expect(result).toEqual({
      freedBytes: 500,
      deletedCount: 2,
      errors: [],
      verified: true,
    });
  });

  it('deletes all downloaded chapters of the novel when no ids are given', async () => {
    [novelDir, chapter11].forEach(path => presentPaths.add(path));
    (getDownloadedChapters as jest.Mock).mockResolvedValue([
      { id: 11, novelId: 7, pluginId: 'multi', novelName: 'Novel Seven' },
      { id: 99, novelId: 42, pluginId: 'multi', novelName: 'Other novel' },
    ]);
    (NativeFile.getDirectoryStats as jest.Mock).mockImplementation(
      async (path: string) =>
        path === novelDir && !presentPaths.has(chapter11)
          ? { size: 0, files: 0, folders: 0, skipped: 0 }
          : { size: 200, files: 2, folders: 1, skipped: 0 },
    );

    const result = await deleteNovelChapters(7);

    expect(NativeFile.unlink).toHaveBeenCalledTimes(1);
    expect(NativeFile.unlink).toHaveBeenCalledWith(chapter11);
    expect(markChaptersNotDownloaded).toHaveBeenCalledWith([11]);
    expect(result.deletedCount).toBe(1);
    expect(result.verified).toBe(true);
  });

  it('propagates per-chapter errors and keeps the DB flag for failed chapters', async () => {
    [novelDir, chapter11, chapter12].forEach(path => presentPaths.add(path));
    (NativeFile.getDirectoryStats as jest.Mock).mockImplementation(
      async (path: string) => {
        if (path !== novelDir) {
          return directoryStats.get(path) ?? { ...ZERO };
        }
        const size =
          500 +
          (presentPaths.has(chapter11) ? 200 : 0) +
          (presentPaths.has(chapter12) ? 300 : 0);
        return { size, files: 3, folders: 2, skipped: 0 };
      },
    );
    (NativeFile.unlink as jest.Mock).mockImplementation(
      async (path: string) => {
        if (path === chapter12) {
          throw new Error('EBUSY: resource busy');
        }
        presentPaths.delete(path);
      },
    );

    const result = await deleteNovelChapters(7, [11, 12]);

    expect(result.deletedCount).toBe(1);
    expect(result.freedBytes).toBe(200);
    expect(result.verified).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(chapter12);
    expect(result.errors[0]).toContain('EBUSY');
    expect(markChaptersNotDownloaded).toHaveBeenCalledWith([11]);
  });

  it('refuses with a clear error while a download for that novel is active', async () => {
    mockQueue([
      queueEntry('DOWNLOAD_CHAPTER', {
        novelName: 'Novel Seven',
        novelId: 7,
        chapters: [{ chapterId: 1, chapterName: 'c1' }],
      }),
    ]);

    await expect(deleteNovelChapters(7, [11])).rejects.toThrow(
      'dataStorage.errors.downloadsInProgress',
    );
    expect(NativeFile.unlink).not.toHaveBeenCalled();
    expect(getNovelById).not.toHaveBeenCalled();
  });

  it('refuses while a backup or restore is running', async () => {
    mockQueue([
      queueEntry('LOCAL_BACKUP', { destinationUri: 'file:///x.zip' }),
    ]);

    await expect(deleteNovelChapters(7, [11])).rejects.toThrow(
      'dataStorage.errors.backupInProgress',
    );
  });

  it('refuses when the resolved chapter path escapes the app container', async () => {
    (getNovelById as jest.Mock).mockReturnValue({
      id: 7,
      pluginId: '../../../../etc',
      name: 'Evil plugin id',
    });

    await expect(deleteNovelChapters(7, [11])).rejects.toThrow(
      /outside the app container/,
    );
    expect(NativeFile.unlink).not.toHaveBeenCalled();
  });

  it('is a verified no-op when the novel has no downloaded chapters', async () => {
    const result = await deleteNovelChapters(7);
    expect(result).toEqual({
      freedBytes: 0,
      deletedCount: 0,
      errors: [],
      verified: true,
    });
    expect(NativeFile.unlink).not.toHaveBeenCalled();
  });
});

describe('deleteAllChaptersOfNovel', () => {
  it('removes stale on-disk chapter folders too, but keeps the novel entry', async () => {
    const novelDir = `${NOVEL_STORAGE}/multi/7`;
    [novelDir, `${novelDir}/11`, `${novelDir}/12`].forEach(path =>
      presentPaths.add(path),
    );
    dirEntries.set(novelDir, [
      entry('11', `${novelDir}/11`, true),
      entry('12', `${novelDir}/12`, true),
      entry('cover.png', `${novelDir}/cover.png`, false),
    ]);
    (getNovelById as jest.Mock).mockReturnValue({
      id: 7,
      pluginId: 'multi',
      name: 'Novel Seven',
    });
    (getDownloadedChapters as jest.Mock).mockResolvedValue([
      { id: 11, novelId: 7, pluginId: 'multi', novelName: 'Novel Seven' },
    ]);

    const result = await deleteAllChaptersOfNovel(7);

    expect(NativeFile.unlink).toHaveBeenCalledWith(`${novelDir}/11`);
    expect(NativeFile.unlink).toHaveBeenCalledWith(`${novelDir}/12`);
    expect(NativeFile.unlink).not.toHaveBeenCalledWith(`${novelDir}/cover.png`);
    expect(NativeFile.unlink).not.toHaveBeenCalledWith(novelDir);
    expect(markChaptersNotDownloaded).toHaveBeenCalledWith([11, 12]);
    expect(result.deletedCount).toBe(2);
    expect(result.verified).toBe(true);
  });
});

describe('deleteCategory', () => {
  it('clears WebView data through the native function and removes WebKit dirs', async () => {
    const webkitCaches = `${CACHES}/WebKit`;
    const webkitLibrary = `${LIBRARY}/WebKit`;
    dirEntries.set(CACHES, [entry('WebKit', webkitCaches, true)]);
    presentPaths.add(CACHES);
    presentPaths.add(webkitCaches);
    presentPaths.add(webkitLibrary);
    directoryStats.set(webkitCaches, {
      size: 200,
      files: 5,
      folders: 1,
      skipped: 0,
    });
    directoryStats.set(webkitLibrary, {
      size: 50,
      files: 1,
      folders: 1,
      skipped: 0,
    });

    const result = await deleteCategory('webview');

    expect(NativeFile.clearWebViewWebsiteData).toHaveBeenCalledTimes(1);
    expect(NativeFile.unlink).toHaveBeenCalledWith(webkitCaches);
    expect(NativeFile.unlink).toHaveBeenCalledWith(webkitLibrary);
    expect(result.freedBytes).toBe(250);
    expect(result.verified).toBe(true);
  });

  it('clears the expo-image disk cache and unlinks cache folders, never the backup staging', async () => {
    const sdwebImage = `${CACHES}/com.hackemist.SDWebImageCache.default`;
    dirEntries.set(CACHES, [
      entry('com.hackemist.SDWebImageCache.default', sdwebImage, true),
      entry('BackupData', BACKUP_DIR, true),
    ]);
    presentPaths.add(CACHES);
    presentPaths.add(sdwebImage);
    presentPaths.add(BACKUP_DIR);
    directoryStats.set(sdwebImage, {
      size: 300,
      files: 9,
      folders: 1,
      skipped: 0,
    });
    directoryStats.set(BACKUP_DIR, {
      size: 100,
      files: 3,
      folders: 0,
      skipped: 0,
    });

    const result = await deleteCategory('images');

    expect(Image.clearDiskCache).toHaveBeenCalledTimes(1);
    expect(Image.clearMemoryCache).toHaveBeenCalledTimes(1);
    expect(NativeFile.unlink).toHaveBeenCalledWith(sdwebImage);
    expect(NativeFile.unlink).not.toHaveBeenCalledWith(BACKUP_DIR);
    expect(result.freedBytes).toBe(300);
    expect(result.verified).toBe(true);
  });

  it('clears temp contents without removing the tmp directory itself', async () => {
    const fileA = `${TEMP_DIR}/a.tmp`;
    const fileB = `${TEMP_DIR}/sub`;
    dirEntries.set(TEMP_DIR, [
      entry('a.tmp', fileA, false),
      entry('sub', fileB, true),
    ]);
    presentPaths.add(TEMP_DIR);
    presentPaths.add(fileA);
    presentPaths.add(fileB);
    directoryStats.set(fileA, { size: 10, files: 1, folders: 0, skipped: 0 });
    directoryStats.set(fileB, { size: 30, files: 2, folders: 0, skipped: 0 });

    const result = await deleteCategory('temp');

    expect(NativeFile.unlink).toHaveBeenCalledWith(fileA);
    expect(NativeFile.unlink).toHaveBeenCalledWith(fileB);
    expect(NativeFile.unlink).not.toHaveBeenCalledWith(TEMP_DIR);
    expect(result.freedBytes).toBe(40);
    expect(result.verified).toBe(true);
  });

  it('removes backup staging artifacts only (never the database)', async () => {
    presentPaths.add(BACKUP_DIR);
    presentPaths.add(`${BACKUP_DIR}.zip`);

    const result = await deleteCategory('backups');

    expect(NativeFile.unlink).toHaveBeenCalledWith(BACKUP_DIR);
    expect(NativeFile.unlink).toHaveBeenCalledWith(`${BACKUP_DIR}.zip`);
    expect(NativeFile.unlink).not.toHaveBeenCalledWith(DATABASE_DIR);
    expect(result.deletedCount).toBe(2);
    expect(result.verified).toBe(true);
  });

  it('refuses non-rebuildable categories without touching any file', async () => {
    await expect(deleteCategory('databases')).rejects.toThrow(
      'dataStorage.errors.categoryNotDeletable',
    );
    await expect(deleteCategory('documents')).rejects.toThrow(
      'dataStorage.errors.categoryNotDeletable',
    );
    await expect(deleteCategory('downloads')).rejects.toThrow(
      'dataStorage.errors.categoryNotDeletable',
    );
    expect(NativeFile.unlink).not.toHaveBeenCalled();
  });

  it('refuses temp deletion while any background task is active', async () => {
    mockQueue([queueEntry('UPDATE_LIBRARY', { categoryName: 'Reading' })]);
    await expect(deleteCategory('temp')).rejects.toThrow(
      'dataStorage.errors.tasksInProgress',
    );
    expect(NativeFile.unlink).not.toHaveBeenCalled();
  });

  it('refuses category deletion while a backup is running', async () => {
    mockQueue([
      queueEntry('DRIVE_BACKUP', { id: 'file-1', name: 'backup.zip' }),
    ]);
    await expect(deleteCategory('images')).rejects.toThrow(
      'dataStorage.errors.backupInProgress',
    );
  });

  it('deletes the crash-log folder when it exists and verifies a missing one', async () => {
    // Nothing on disk (the iOS crash module writes no files) → verified no-op.
    const missing = await deleteCategory('crashLogs');
    expect(missing).toEqual({
      freedBytes: 0,
      deletedCount: 0,
      errors: [],
      verified: true,
    });

    presentPaths.add(`${LIBRARY}/CrashReports`);
    const result = await deleteCategory('crashLogs');
    expect(NativeFile.unlink).toHaveBeenCalledWith(`${LIBRARY}/CrashReports`);
    expect(result.verified).toBe(true);
  });
});

describe('rebuildable category contract', () => {
  it('allows exactly the rebuildable categories', () => {
    expect(isRebuildableCategory('images')).toBe(true);
    expect(isRebuildableCategory('temp')).toBe(true);
    expect(isRebuildableCategory('webview')).toBe(true);
    expect(isRebuildableCategory('crashLogs')).toBe(true);
    expect(isRebuildableCategory('backups')).toBe(true);
    expect(isRebuildableCategory('downloads')).toBe(false);
    expect(isRebuildableCategory('databases')).toBe(false);
    expect(isRebuildableCategory('documents')).toBe(false);
    expect(isRebuildableCategory('library')).toBe(false);
  });
});
