import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  LegendList,
  LegendListRenderItemProps,
} from '@legendapp/list/react-native';

import { EmptyView } from '@components';
import {
  useBrowseSettings,
  useFilteredInstalledPlugins,
  useLastUsedPluginId,
  usePinnedPlugins,
  usePluginActions,
} from '@hooks/persisted';
import { BrowseScreenProps } from '@navigators/types';
import { PluginItem } from '@plugins/types';
import { getString } from '@i18n/translations';
import { ThemeColors } from '@theme/types';

import DiscoverCard from '../discover/DiscoverCard';
import {
  buildSourceEntries,
  buildSourceRows,
  SourceCardEntry,
  SourceListRow,
} from '../utils/buildBrowseEntries';
import {
  CARD_ESTIMATED_HEIGHT,
  CARD_GAP,
  WIDE_LAYOUT_MAX_CONTENT_WIDTH,
  getBrowseColumns,
} from '../utils/browseLayout';
import SourceCard from './SourceCard';

interface SourcesTabProps {
  navigation: BrowseScreenProps['navigation'];
  onOpenPlugins: () => void;
  searchText: string;
  theme: ThemeColors;
}

export const SourcesTab = memo(
  ({ navigation, onOpenPlugins, searchText, theme }: SourcesTabProps) => {
    const installedPlugins = useFilteredInstalledPlugins();
    const lastUsedPluginId = useLastUsedPluginId();
    const pinnedPlugins = usePinnedPlugins();
    const { setLastUsedPluginId, togglePinPlugin } = usePluginActions();
    const { showMyAnimeList, showAniList } = useBrowseSettings();
    const { width: windowWidth } = useWindowDimensions();
    const columns = getBrowseColumns(windowWidth);

    const navigateToSource = useCallback(
      (plugin: PluginItem, showLatestNovels?: boolean) => {
        navigation.navigate('SourceScreen', {
          pluginId: plugin.id,
          pluginName: plugin.name,
          site: plugin.site,
          showLatestNovels,
        });
        setLastUsedPluginId(plugin.id);
      },
      [navigation, setLastUsedPluginId],
    );

    const openSource = useCallback(
      (plugin: PluginItem) => navigateToSource(plugin),
      [navigateToSource],
    );

    const openLatest = useCallback(
      (plugin: PluginItem) => navigateToSource(plugin, true),
      [navigateToSource],
    );

    const togglePin = useCallback(
      (plugin: PluginItem) => {
        togglePinPlugin(plugin.id);
      },
      [togglePinPlugin],
    );

    const entries = useMemo(() => {
      return buildSourceEntries({
        installedPlugins,
        lastUsedPluginId,
        pinnedPluginIds: pinnedPlugins,
        searchText,
        showAniList,
        showMyAnimeList,
      });
    }, [
      installedPlugins,
      lastUsedPluginId,
      pinnedPlugins,
      searchText,
      showAniList,
      showMyAnimeList,
    ]);

    const rows = useMemo(
      () => buildSourceRows(entries, columns),
      [entries, columns],
    );

    const renderSourceCard = useCallback(
      (entry: SourceCardEntry, fillCard: boolean) => (
        <SourceCard
          key={entry.key}
          domain={entry.domain}
          isPinned={entry.isPinned}
          onLatestPress={openLatest}
          onPinPress={togglePin}
          onPress={openSource}
          plugin={entry.plugin}
          style={fillCard ? styles.cardFilled : styles.cardHalf}
          theme={theme}
        />
      ),
      [openLatest, openSource, theme, togglePin],
    );

    const renderItem = useCallback(
      ({ item }: LegendListRenderItemProps<SourceListRow>) => {
        if (item.type === 'card-row') {
          const fillCard = columns === 1 || item.entries.length > 1;
          return (
            <View style={styles.cardRow}>
              {item.entries.map(entry => renderSourceCard(entry, fillCard))}
            </View>
          );
        }

        if (item.type === 'header') {
          return (
            <Text
              style={[styles.sectionHeader, { color: theme.onSurfaceVariant }]}
            >
              {item.title}
            </Text>
          );
        }

        if (item.type === 'discover') {
          const isAniList = item.tracker === 'AniList';
          return (
            <DiscoverCard
              theme={theme}
              icon={
                isAniList
                  ? require('../../../../assets/anilist.png')
                  : require('../../../../assets/mal.png')
              }
              trackerName={item.tracker}
              onPress={() =>
                navigation.navigate(isAniList ? 'BrowseAL' : 'BrowseMal')
              }
            />
          );
        }

        if (item.type === 'empty') {
          return (
            <View style={styles.inlineEmpty}>
              <EmptyView
                description={getString('browseScreen.noSources')}
                actions={[
                  {
                    iconName: 'puzzle-outline',
                    onPress: onOpenPlugins,
                    title: getString('browseScreen.plugins'),
                  },
                ]}
                theme={theme}
              />
            </View>
          );
        }

        return renderSourceCard(item, true);
      },
      [columns, navigation, onOpenPlugins, renderSourceCard, theme],
    );

    return (
      <LegendList
        data={rows}
        estimatedItemSize={CARD_ESTIMATED_HEIGHT}
        getItemType={item => item.type}
        keyExtractor={item => item.key}
        ListEmptyComponent={
          <EmptyView
            description={getString('browseScreen.noSearchResults')}
            theme={theme}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          columns > 1 && styles.listContentWide,
          !rows.length && styles.emptyList,
        ]}
        recycleItems
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    );
  },
);

const styles = StyleSheet.create({
  cardFilled: {
    flex: 1,
  },
  cardHalf: {
    width: '50%',
  },
  cardRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  emptyList: {
    flexGrow: 1,
  },
  inlineEmpty: {
    height: 240,
  },
  listContent: {
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  listContentWide: {
    alignSelf: 'center',
    maxWidth: WIDE_LAYOUT_MAX_CONTENT_WIDTH,
    width: '100%',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    paddingBottom: 4,
    paddingTop: 8,
  },
});
