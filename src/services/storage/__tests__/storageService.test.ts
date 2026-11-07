// Data & Storage service — the delete paths must go through the app's
// canonical chapter deletion (files + isDownloaded flags), refuse unknown
// categories, and report REAL freed bytes.

jest.mock('expo-image', () => ({
  Image: { clearDiskCache: jest.fn().mockResolvedValue(true) },
}));

jest.mock('@modules/native-file', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/container/Documents',
    ExternalDirectoryPath: '/container/Documents',
    ExternalCachesDirectoryPath: '/container/Library/Caches',
    getStorageInfo: jest.fn(),
    getDirectoryStats: jest.fn(),
    deleteDirectoryContents: jest.fn(),
    readDir: jest.fn(),
    exists: jest.fn(),
    mkdir: jest.fn(),
    unlink: jest.fn(),
  },
}));

jest.mock('@utils/Storages', () => ({
  NOVEL_STORAGE: '/container/Documents/Novels',
  PLUGIN_STORAGE: '/container/Documents/Plugins',
  ROOT_STORAGE: '/container/Documents',
}));

jest.mock('@services/backup/utils', () => ({
  CACHE_DIR_PATH: '/container/Library/Caches/BackupData',
  clearBackupCache: jest.fn().mockResolvedValue(undefined),
}));

const mockDeleteChapters = jest.fn().mockResolvedValue(undefined);
const mockGetDownloadedChapters = jest.fn().mockResolvedValue([]);
const mockGetAllNovels = jest.fn().mockResolvedValue([]);

jest.mock('@database/queries/ChapterQueries', () => ({
  deleteChapters: (...a: unknown[]) => mockDeleteChapters(...a),
  getDownloadedChapters: () => mockGetDownloadedChapters(),
}));

jest.mock('@database/queries/NovelQueries', () => ({
  getAllNovels: () => mockGetAllNovels(),
}));

// eslint-disable-next-line import/first -- must stay after jest.mock factories
import NativeFile from '@modules/native-file';
import {
  deleteNovelChapters,
  deleteStorageCategory,
  getNovelStorageBreakdown,
  getStorageOverview,
} from '../storageService';

const mockedNativeFile = NativeFile as jest.Mocked<typeof NativeFile>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getStorageOverview', () => {
  it('maps native categories and flags databases as non-deletable', async () => {
    (mockedNativeFile.getStorageInfo as jest.Mock).mockResolvedValue({
      deviceTotalBytes: 64 * 1024 ** 3,
      deviceFreeBytes: 10 * 1024 ** 3,
      containerBytes: 500 * 1024 * 1024,
      categories: {
        downloads: { path: '/d', bytes: 100, files: 5, folders: 2, exists: true },
        caches: { path: '/c', bytes: 40, files: 4, folders: 1, exists: true },
        databases: { path: '/l', bytes: 8, files: 1, folders: 0, exists: true },
      },
    });
    (mockedNativeFile.readDir as jest.Mock).mockResolvedValue([]);

    const overview = await getStorageOverview();

    expect(overview.deviceTotalBytes).toBe(64 * 1024 ** 3);
    const dbs = overview.categories.find(c => c.id === 'databases');
    expect(dbs?.deletable).toBe(false);
    expect(dbs?.rebuildable).toBe(false);
    const downloads = overview.categories.find(c => c.id === 'downloads');
    expect(downloads?.bytes).toBe(100);
    expect(downloads?.deletable).toBe(true);
  });
});

describe('deleteStorageCategory', () => {
  it('deletes webview caches through the confined native call and reports real bytes', async () => {
    (mockedNativeFile.exists as jest.Mock).mockResolvedValue(true);
    (mockedNativeFile.deleteDirectoryContents as jest.Mock).mockResolvedValue({
      deletedBytes: 4096,
      errors: [],
    });

    const result = await deleteStorageCategory('webview');

    expect(mockedNativeFile.deleteDirectoryContents).toHaveBeenCalledWith(
      '/container/Library/WebKit',
    );
    expect(result.freedBytes).toBe(4096);
    expect(result.errors).toEqual([]);
  });

  it('propagates native delete errors instead of faking success', async () => {
    (mockedNativeFile.deleteDirectoryContents as jest.Mock).mockResolvedValue({
      deletedBytes: 12,
      errors: ['locked-file: Operation not permitted'],
    });

    const result = await deleteStorageCategory('crashLogs');
    expect(result.errors).toContain('locked-file: Operation not permitted');
    expect(result.freedBytes).toBe(12);
  });

  it('refuses to delete personal data categories', async () => {
    await expect(deleteStorageCategory('databases')).rejects.toThrow(
      /dedicated flows/,
    );
    await expect(deleteStorageCategory('downloads')).rejects.toThrow(
      /dedicated flows/,
    );
    expect(mockedNativeFile.deleteDirectoryContents).not.toHaveBeenCalled();
  });
});

describe('getNovelStorageBreakdown + deleteNovelChapters', () => {
  it('matches folders to DB novels and reports orphans separately', async () => {
    mockGetAllNovels.mockResolvedValue([
      { id: 7, pluginId: 'p1', name: 'رواية', cover: 'c.jpg' },
    ]);
    (mockedNativeFile.readDir as jest.Mock).mockImplementation(
      async (dir: string) => {
        if (dir === '/container/Documents/Novels') {
          return [
            { name: 'p1', path: '/container/Documents/Novels/p1', isDirectory: true },
          ];
        }
        return [
          { name: '7', path: '/container/Documents/Novels/p1/7', isDirectory: true },
          { name: '999', path: '/container/Documents/Novels/p1/999', isDirectory: true },
        ];
      },
    );
    (mockedNativeFile.getDirectoryStats as jest.Mock).mockImplementation(
      async (p: string) => ({
        path: p,
        bytes: p.endsWith('/7') ? 2048 : 512,
        files: 3,
        folders: 1,
        exists: true,
      }),
    );

    const { novels, orphanBytes } = await getNovelStorageBreakdown();

    expect(novels).toHaveLength(1);
    expect(novels[0]).toMatchObject({
      novelId: 7,
      pluginId: 'p1',
      title: 'رواية',
      bytes: 2048,
    });
    expect(orphanBytes).toBe(512);
  });

  it('deleteNovelChapters goes through the canonical query and reports the real delta', async () => {
    mockGetDownloadedChapters.mockResolvedValue([
      { id: 1, novelId: 7, pluginId: 'p1' },
      { id: 2, novelId: 7, pluginId: 'p1' },
      { id: 3, novelId: 8, pluginId: 'p1' },
    ]);
    // The folder measured 2048 before deletion; after the canonical delete
    // runs, the re-measure sees an (almost) empty folder.
    let deleted = false;
    mockDeleteChapters.mockImplementation(async () => {
      deleted = true;
    });
    (mockedNativeFile.getDirectoryStats as jest.Mock).mockImplementation(
      async () => ({
        path: '/x',
        bytes: deleted ? 0 : 2048,
        files: 0,
        folders: 1,
        exists: true,
      }),
    );

    const result = await deleteNovelChapters({ id: 7, pluginId: 'p1' }, 2048);

    // only novel 7's chapters — never another novel's rows
    expect(mockDeleteChapters).toHaveBeenCalledWith('p1', 7, [1, 2]);
    expect(result.freedBytes).toBe(2048);
    expect(result.errors).toEqual([]);
  });

  it('flags files-remained when the folder still has bytes after deletion', async () => {
    mockGetDownloadedChapters.mockResolvedValue([
      { id: 1, novelId: 7, pluginId: 'p1' },
    ]);
    (mockedNativeFile.getDirectoryStats as jest.Mock).mockResolvedValue({
      path: '/x',
      bytes: 700,
      files: 1,
      folders: 1,
      exists: true,
    });

    const result = await deleteNovelChapters({ id: 7, pluginId: 'p1' }, 2048);
    expect(result.errors).toContain('files-remained');
  });
});
