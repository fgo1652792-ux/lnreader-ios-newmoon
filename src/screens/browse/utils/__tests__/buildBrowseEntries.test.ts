import { PluginItem } from '@plugins/types';

import {
  buildPluginEntries,
  buildPluginRows,
  buildSourceEntries,
  buildSourceRows,
  getSourceDomain,
  SourceEntry,
} from '../buildBrowseEntries';

const plugin = (
  id: string,
  name: string,
  lang = 'English',
  hasUpdate = false,
  overrides: Partial<PluginItem> = {},
): PluginItem => ({
  hasUpdate,
  iconUrl: `${id}.png`,
  id,
  lang,
  name,
  site: `https://${id}.example.com`,
  url: `https://example.com/${id}.js`,
  version: '1.0.0',
  ...overrides,
});

describe('buildSourceEntries', () => {
  const last = plugin('last', 'Last');
  const pinned = plugin('pinned', 'Pinned');
  const remaining = plugin('remaining', 'Remaining');

  it('orders discover, last used, pinned, then language groups without duplicates', () => {
    const entries = buildSourceEntries({
      installedPlugins: [remaining, pinned, last],
      lastUsedPluginId: last.id,
      pinnedPluginIds: [last.id, pinned.id],
      searchText: '',
      showAniList: true,
      showMyAnimeList: false,
    });

    expect(entries.map(entry => entry.key)).toEqual([
      'discover-header',
      'discover-anilist',
      'last-used-header',
      'last-used-last',
      'pinned-header',
      'pinned-pinned',
      'language-English',
      'source-remaining',
    ]);
    expect(
      entries
        .filter(entry => entry.type === 'source')
        .map(entry => entry.plugin.id),
    ).toEqual(['last', 'pinned', 'remaining']);
  });

  it('adds a derived domain to every source entry', () => {
    const entries = buildSourceEntries({
      installedPlugins: [plugin('novelbin', 'NovelBin')],
      pinnedPluginIds: [],
      searchText: '',
      showAniList: false,
      showMyAnimeList: false,
    });

    const sourceEntry = entries.find(
      (entry): entry is Extract<SourceEntry, { type: 'source' }> =>
        entry.type === 'source',
    );
    expect(sourceEntry?.domain).toBe('novelbin.example.com');
    expect(sourceEntry?.isPinned).toBe(false);
  });

  it('returns no entries when a search has no matches', () => {
    expect(
      buildSourceEntries({
        installedPlugins: [last],
        pinnedPluginIds: [],
        searchText: 'missing',
        showAniList: true,
        showMyAnimeList: true,
      }),
    ).toEqual([]);
  });

  it('adds an inline source empty state after discover content', () => {
    expect(
      buildSourceEntries({
        installedPlugins: [],
        pinnedPluginIds: [],
        searchText: '',
        showAniList: true,
        showMyAnimeList: false,
      }).map(entry => entry.key),
    ).toEqual(['discover-header', 'discover-anilist', 'no-sources']);
  });
});

describe('getSourceDomain', () => {
  it('prefers site over url', () => {
    expect(
      getSourceDomain(
        plugin('a', 'A', 'English', false, {
          site: 'https://novelbin.com/updates',
          url: 'https://raw.githubusercontent.com/a.js',
        }),
      ),
    ).toBe('novelbin.com');
  });

  it('strips paths, query, fragments and www, and lowercases the host', () => {
    expect(
      getSourceDomain(
        plugin('a', 'A', 'English', false, {
          site: 'https://www.NovelBin.com/some/path?q=1#latest',
        }),
      ),
    ).toBe('novelbin.com');
  });

  it('falls back to url when site is missing', () => {
    expect(
      getSourceDomain(
        plugin('a', 'A', 'English', false, {
          site: '',
          url: 'https://www.Example.com/plugins/a.js',
        }),
      ),
    ).toBe('example.com');
  });

  it('returns null when both site and url are missing', () => {
    expect(
      getSourceDomain(
        plugin('a', 'A', 'English', false, { site: '', url: '' }),
      ),
    ).toBeNull();
  });

  it('returns null for garbage values', () => {
    expect(
      getSourceDomain(
        plugin('a', 'A', 'English', false, {
          site: 'not a url',
          url: '!!!',
        }),
      ),
    ).toBeNull();
    expect(
      getSourceDomain(
        plugin('a', 'A', 'English', false, {
          site: '',
          url: 'localhost',
        }),
      ),
    ).toBeNull();
  });

  it('parses bare hosts without a protocol', () => {
    expect(
      getSourceDomain(
        plugin('a', 'A', 'English', false, {
          site: 'NovelBin.com/path',
          url: '',
        }),
      ),
    ).toBe('novelbin.com');
  });
});

describe('buildSourceRows', () => {
  const a = plugin('a', 'A');
  const b = plugin('b', 'B');
  const c = plugin('c', 'C', 'Arabic');

  it('wraps every source entry in its own row for a single column', () => {
    const entries = buildSourceEntries({
      installedPlugins: [a, b],
      pinnedPluginIds: [],
      searchText: '',
      showAniList: false,
      showMyAnimeList: false,
    });

    const rows = buildSourceRows(entries, 1);
    expect(rows.map(row => row.type)).toEqual([
      'header',
      'card-row',
      'card-row',
    ]);
    expect(
      rows.map(row => (row.type === 'card-row' ? row.entries.length : 0)),
    ).toEqual([0, 1, 1]);
  });

  it('groups consecutive source entries and never pairs across sections', () => {
    const entries = buildSourceEntries({
      installedPlugins: [a, b, c],
      pinnedPluginIds: [a.id, b.id],
      searchText: '',
      showAniList: false,
      showMyAnimeList: false,
    });

    const rows = buildSourceRows(entries, 2);
    expect(rows.map(row => row.key)).toEqual([
      'pinned-header',
      'card-row-pinned-a|pinned-b',
      'language-Arabic',
      'card-row-source-c',
    ]);
  });

  it('keeps an odd trailing source as a single half-width row', () => {
    const entries = buildSourceEntries({
      installedPlugins: [a, b, c],
      pinnedPluginIds: [],
      searchText: '',
      showAniList: false,
      showMyAnimeList: false,
    });

    const rows = buildSourceRows(entries, 2);
    expect(rows.map(row => row.key)).toEqual([
      'language-Arabic',
      'card-row-source-c',
      'language-English',
      'card-row-source-a|source-b',
    ]);
  });
});

describe('buildPluginEntries', () => {
  it('orders updates, installed plugins, then available language groups', () => {
    const entries = buildPluginEntries({
      availablePlugins: [plugin('available', 'Available')],
      installedPlugins: [
        plugin('installed', 'Installed'),
        plugin('update', 'Update', 'English', true),
      ],
      searchText: '',
    });

    expect(entries.map(entry => entry.key)).toEqual([
      'updates-header',
      'update-update',
      'installed-plugins-header',
      'installed-installed',
      'available-language-English',
      'available-available',
    ]);
  });

  it('returns no entries when a search has no matches', () => {
    expect(
      buildPluginEntries({
        availablePlugins: [plugin('available', 'Available')],
        installedPlugins: [],
        searchText: 'missing',
      }),
    ).toEqual([]);
  });

  it('groups consecutive plugin entries into rows for multiple columns', () => {
    const entries = buildPluginEntries({
      availablePlugins: [
        plugin('available-a', 'A'),
        plugin('available-b', 'B'),
        plugin('available-c', 'C'),
      ],
      installedPlugins: [],
      searchText: '',
    });

    const rows = buildPluginRows(entries, 2);
    expect(rows.map(row => row.key)).toEqual([
      'available-language-English',
      'card-row-available-available-a|available-available-b',
      'card-row-available-available-c',
    ]);
  });
});
