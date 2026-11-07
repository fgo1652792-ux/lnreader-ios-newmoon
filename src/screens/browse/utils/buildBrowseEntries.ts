import { PluginItem } from '@plugins/types';
import { getString } from '@i18n/translations';
import { getLocaleLanguageName } from '@utils/constants/languages';

export type SourceEntry =
  | {
      key: string;
      title: string;
      type: 'header';
    }
  | {
      domain: string | null;
      isPinned: boolean;
      key: string;
      plugin: PluginItem;
      type: 'source';
    }
  | {
      key: string;
      tracker: 'AniList' | 'MyAnimeList';
      type: 'discover';
    }
  | {
      key: 'no-sources';
      type: 'empty';
    };

interface BuildSourceEntriesOptions {
  installedPlugins: readonly PluginItem[];
  lastUsedPluginId?: string;
  pinnedPluginIds: readonly string[];
  searchText: string;
  showAniList: boolean;
  showMyAnimeList: boolean;
}

const matchesSearch = (plugin: PluginItem, normalizedSearch: string) =>
  plugin.name.toLocaleLowerCase().includes(normalizedSearch) ||
  plugin.id.toLocaleLowerCase().includes(normalizedSearch);

const PROTOCOL_PATTERN = /^https?:\/\//i;
const WWW_PREFIX_PATTERN = /^www\./i;
const TRAILING_DOTS_PATTERN = /\.+$/;
const HOST_TERMINATOR_PATTERN = /[/?#]/;
// A displayable domain: dot-separated alphanumeric/hyphen labels, no spaces.
const DOMAIN_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const normalizeHost = (host: string): string =>
  host
    .replace(WWW_PREFIX_PATTERN, '')
    .replace(TRAILING_DOTS_PATTERN, '')
    .toLowerCase();

const isValidDomain = (host: string): boolean => DOMAIN_PATTERN.test(host);

const parseHostFromUrl = (value: string): string | null => {
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    return null;
  }
};

const parseHostFromRawValue = (value: string): string | null => {
  const withoutProtocol = value.replace(PROTOCOL_PATTERN, '');
  const authority = withoutProtocol.split(HOST_TERMINATOR_PATTERN, 1)[0] ?? '';
  const withoutUserInfo = authority.includes('@')
    ? authority.slice(authority.lastIndexOf('@') + 1)
    : authority;
  const withoutPort = withoutUserInfo.split(':', 1)[0] ?? '';
  return normalizeHost(withoutPort);
};

const parseDomain = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }
  const urlCandidate = PROTOCOL_PATTERN.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;
  const host =
    parseHostFromUrl(urlCandidate) ?? parseHostFromRawValue(trimmedValue);
  return host !== null && isValidDomain(host) ? host : null;
};

/**
 * Derives the display domain of a plugin without ever inventing one.
 * Prefers `plugin.site` and falls back to `plugin.url`; returns null when no
 * valid host (with at least one dot) can be parsed from either.
 */
export const getSourceDomain = (
  plugin: Pick<PluginItem, 'site' | 'url'>,
): string | null => parseDomain(plugin.site) ?? parseDomain(plugin.url);

export const buildSourceEntries = ({
  installedPlugins,
  lastUsedPluginId,
  pinnedPluginIds,
  searchText,
  showAniList,
  showMyAnimeList,
}: BuildSourceEntriesOptions): SourceEntry[] => {
  const normalizedSearch = searchText.trim().toLocaleLowerCase();
  const sortedPlugins = [...installedPlugins].sort(
    (firstPlugin, secondPlugin) =>
      firstPlugin.lang.localeCompare(secondPlugin.lang) ||
      firstPlugin.name.localeCompare(secondPlugin.name),
  );
  const pinnedIds = new Set(pinnedPluginIds);
  const domains = new Map(
    sortedPlugins.map(plugin => [plugin.id, getSourceDomain(plugin)]),
  );
  const toSourceEntry = (
    keyPrefix: string,
    plugin: PluginItem,
    isPinned: boolean,
  ): SourceEntry => ({
    domain: domains.get(plugin.id) ?? null,
    isPinned,
    key: `${keyPrefix}-${plugin.id}`,
    plugin,
    type: 'source',
  });

  if (normalizedSearch) {
    const searchResults = sortedPlugins.filter(plugin =>
      matchesSearch(plugin, normalizedSearch),
    );

    if (!searchResults.length) return [];

    return [
      {
        key: 'search-results-header',
        type: 'header',
        title: getString('browseScreen.searchResults'),
      },
      ...searchResults.map(plugin =>
        toSourceEntry('search', plugin, pinnedIds.has(plugin.id)),
      ),
    ];
  }

  const result: SourceEntry[] = [];
  const lastUsedPlugin = sortedPlugins.find(
    plugin => plugin.id === lastUsedPluginId,
  );
  const visibleLastUsedPluginId = lastUsedPlugin?.id;
  const pinned = sortedPlugins.filter(
    plugin => pinnedIds.has(plugin.id) && plugin.id !== visibleLastUsedPluginId,
  );
  const remaining = sortedPlugins.filter(
    plugin =>
      !pinnedIds.has(plugin.id) && plugin.id !== visibleLastUsedPluginId,
  );

  if (showAniList || showMyAnimeList) {
    result.push({
      key: 'discover-header',
      type: 'header',
      title: getString('browseScreen.discover'),
    });
    if (showAniList) {
      result.push({
        key: 'discover-anilist',
        tracker: 'AniList',
        type: 'discover',
      });
    }
    if (showMyAnimeList) {
      result.push({
        key: 'discover-mal',
        tracker: 'MyAnimeList',
        type: 'discover',
      });
    }
  }

  if (lastUsedPlugin) {
    result.push(
      {
        key: 'last-used-header',
        type: 'header',
        title: getString('browseScreen.lastUsed'),
      },
      toSourceEntry(
        'last-used',
        lastUsedPlugin,
        pinnedIds.has(lastUsedPlugin.id),
      ),
    );
  }

  if (pinned.length) {
    result.push({
      key: 'pinned-header',
      type: 'header',
      title: getString('browseScreen.pinnedPlugins'),
    });
    pinned.forEach(plugin =>
      result.push(toSourceEntry('pinned', plugin, true)),
    );
  }

  let previousLanguage: string | undefined;
  remaining.forEach(plugin => {
    if (plugin.lang !== previousLanguage) {
      result.push({
        key: `language-${plugin.lang}`,
        type: 'header',
        title: getLocaleLanguageName(plugin.lang),
      });
      previousLanguage = plugin.lang;
    }
    result.push(toSourceEntry('source', plugin, false));
  });

  if (!sortedPlugins.length) {
    result.push({ key: 'no-sources', type: 'empty' });
  }

  return result;
};

export type PluginStatus = 'available' | 'installed' | 'update';

export type PluginEntry =
  | {
      action?: 'updateAll';
      key: string;
      title: string;
      type: 'header';
    }
  | {
      key: string;
      plugin: PluginItem;
      status: PluginStatus;
      type: 'plugin';
    };

interface BuildPluginEntriesOptions {
  availablePlugins: readonly PluginItem[];
  installedPlugins: readonly PluginItem[];
  searchText: string;
}

export const buildPluginEntries = ({
  availablePlugins,
  installedPlugins,
  searchText,
}: BuildPluginEntriesOptions): PluginEntry[] => {
  const normalizedSearch = searchText.trim().toLocaleLowerCase();
  const installed = [...installedPlugins].sort((first, second) =>
    first.name.localeCompare(second.name),
  );
  const available = [...availablePlugins].sort(
    (first, second) =>
      first.lang.localeCompare(second.lang) ||
      first.name.localeCompare(second.name),
  );

  if (normalizedSearch) {
    const installedMatches = installed.filter(plugin =>
      matchesSearch(plugin, normalizedSearch),
    );
    const availableMatches = available.filter(plugin =>
      matchesSearch(plugin, normalizedSearch),
    );

    if (!installedMatches.length && !availableMatches.length) return [];

    return [
      {
        key: 'plugin-search-header',
        title: getString('browseScreen.searchResults'),
        type: 'header',
      },
      ...installedMatches.map(
        plugin =>
          ({
            key: `installed-search-${plugin.id}`,
            plugin,
            status: plugin.hasUpdate ? 'update' : 'installed',
            type: 'plugin',
          } as const),
      ),
      ...availableMatches.map(
        plugin =>
          ({
            key: `available-search-${plugin.id}`,
            plugin,
            status: 'available',
            type: 'plugin',
          } as const),
      ),
    ];
  }

  const result: PluginEntry[] = [];
  const updates = installed.filter(plugin => plugin.hasUpdate);
  const installedWithoutUpdates = installed.filter(plugin => !plugin.hasUpdate);

  if (updates.length) {
    result.push({
      action: 'updateAll',
      key: 'updates-header',
      title: getString('browseScreen.updatesPending'),
      type: 'header',
    });
    updates.forEach(plugin =>
      result.push({
        key: `update-${plugin.id}`,
        plugin,
        status: 'update',
        type: 'plugin',
      }),
    );
  }

  if (installedWithoutUpdates.length) {
    result.push({
      key: 'installed-plugins-header',
      title: getString('browseScreen.installed'),
      type: 'header',
    });
    installedWithoutUpdates.forEach(plugin =>
      result.push({
        key: `installed-${plugin.id}`,
        plugin,
        status: 'installed',
        type: 'plugin',
      }),
    );
  }

  let previousLanguage: string | undefined;
  available.forEach(plugin => {
    if (plugin.lang !== previousLanguage) {
      result.push({
        key: `available-language-${plugin.lang}`,
        title: getLocaleLanguageName(plugin.lang),
        type: 'header',
      });
      previousLanguage = plugin.lang;
    }
    result.push({
      key: `available-${plugin.id}`,
      plugin,
      status: 'available',
      type: 'plugin',
    });
  });

  return result;
};

export interface CardRowEntry<TEntry extends { key: string }> {
  entries: TEntry[];
  key: string;
  type: 'card-row';
}

/**
 * Groups consecutive card entries into rows of `columns` cards so lists can
 * render a 2-column grid on wide screens. Non-card entries (headers, discover,
 * empty states) always occupy their own full-width row and interrupt grouping
 * so cards never pair across sections.
 */
const groupConsecutiveCards = <TEntry extends { key: string; type: string }>(
  entries: readonly TEntry[],
  columns: number,
  cardEntryType: TEntry['type'],
): (TEntry | CardRowEntry<TEntry>)[] => {
  const rows: (TEntry | CardRowEntry<TEntry>)[] = [];
  let pendingCards: TEntry[] = [];

  const flushPendingCards = () => {
    if (!pendingCards.length) {
      return;
    }
    const groupSize = columns > 1 ? columns : 1;
    for (let index = 0; index < pendingCards.length; index += groupSize) {
      const cards = pendingCards.slice(index, index + groupSize);
      rows.push({
        entries: cards,
        key: `card-row-${cards.map(card => card.key).join('|')}`,
        type: 'card-row',
      });
    }
    pendingCards = [];
  };

  entries.forEach(entry => {
    if (entry.type === cardEntryType) {
      pendingCards.push(entry);
    } else {
      flushPendingCards();
      rows.push(entry);
    }
  });
  flushPendingCards();

  return rows;
};

export type SourceCardEntry = Extract<SourceEntry, { type: 'source' }>;

export type PluginCardEntry = Extract<PluginEntry, { type: 'plugin' }>;

export type SourceListRow =
  | Exclude<SourceEntry, { type: 'source' }>
  | CardRowEntry<SourceCardEntry>;

export type PluginListRow =
  | Exclude<PluginEntry, { type: 'plugin' }>
  | CardRowEntry<PluginCardEntry>;

export const buildSourceRows = (
  entries: readonly SourceEntry[],
  columns: number,
): SourceListRow[] =>
  // Only entries with type 'source' are wrapped in rows by the grouping
  // helper, so the narrower row union always holds at runtime.
  groupConsecutiveCards(entries, columns, 'source') as SourceListRow[];

export const buildPluginRows = (
  entries: readonly PluginEntry[],
  columns: number,
): PluginListRow[] =>
  // Only entries with type 'plugin' are wrapped in rows by the grouping
  // helper, so the narrower row union always holds at runtime.
  groupConsecutiveCards(entries, columns, 'plugin') as PluginListRow[];
