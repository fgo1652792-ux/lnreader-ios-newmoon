import { memo, useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  LegendList,
  LegendListRenderItemProps,
} from '@legendapp/list/react-native';

import { Button, EmptyView } from '@components';
import {
  useFilteredAvailablePlugins,
  useInstalledPlugins,
  usePluginActions,
} from '@hooks/persisted';
import { BrowseScreenProps } from '@navigators/types';
import { PluginItem } from '@plugins/types';
import { getString } from '@i18n/translations';
import { ThemeColors } from '@theme/types';
import { showToast } from '@utils/showToast';
import {
  buildPluginEntries,
  buildPluginRows,
  PluginCardEntry,
  PluginListRow,
} from '../utils/buildBrowseEntries';
import {
  CARD_ESTIMATED_HEIGHT,
  CARD_GAP,
  WIDE_LAYOUT_MAX_CONTENT_WIDTH,
  getBrowseColumns,
} from '../utils/browseLayout';
import PluginCard from './PluginCard';

interface PluginsTabProps {
  navigation: BrowseScreenProps['navigation'];
  searchText: string;
  theme: ThemeColors;
}

export const PluginsTab = memo(
  ({ navigation, searchText, theme }: PluginsTabProps) => {
    const installedPlugins = useInstalledPlugins();
    const availablePlugins = useFilteredAvailablePlugins();
    const { installPlugin, refreshPlugins, updatePlugin } = usePluginActions();
    const [refreshing, setRefreshing] = useState(false);
    const [pendingPluginIds, setPendingPluginIds] = useState<Set<string>>(
      () => new Set(),
    );
    const { width: windowWidth } = useWindowDimensions();
    const columns = getBrowseColumns(windowWidth);

    const updatePendingState = useCallback(
      (pluginId: string, pending: boolean) => {
        setPendingPluginIds(current => {
          const updated = new Set(current);
          if (pending) {
            updated.add(pluginId);
          } else {
            updated.delete(pluginId);
          }
          return updated;
        });
      },
      [],
    );

    const install = useCallback(
      async (plugin: PluginItem) => {
        updatePendingState(plugin.id, true);
        try {
          await installPlugin(plugin);
          showToast(
            getString('browseScreen.installedPlugin', { name: plugin.name }),
          );
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error));
        } finally {
          updatePendingState(plugin.id, false);
        }
      },
      [installPlugin, updatePendingState],
    );

    const update = useCallback(
      async (plugin: PluginItem) => {
        updatePendingState(plugin.id, true);
        try {
          const version = await updatePlugin(plugin);
          showToast(getString('browseScreen.updatedTo', { version }));
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error));
        } finally {
          updatePendingState(plugin.id, false);
        }
      },
      [updatePendingState, updatePlugin],
    );

    const pluginsWithUpdates = useMemo(
      () => installedPlugins.filter(plugin => plugin.hasUpdate),
      [installedPlugins],
    );

    const updateAll = useCallback(async () => {
      await Promise.allSettled(pluginsWithUpdates.map(update));
    }, [pluginsWithUpdates, update]);

    const openDetails = useCallback(
      (plugin: PluginItem) =>
        navigation.navigate('PluginDetails', { pluginId: plugin.id }),
      [navigation],
    );

    const openWebsite = useCallback(
      (plugin: PluginItem) =>
        navigation.navigate('WebviewScreen', {
          name: plugin.name,
          url: plugin.site,
          pluginId: plugin.id,
        }),
      [navigation],
    );

    const entries = useMemo(
      () =>
        buildPluginEntries({
          availablePlugins,
          installedPlugins,
          searchText,
        }),
      [availablePlugins, installedPlugins, searchText],
    );

    const rows = useMemo(
      () => buildPluginRows(entries, columns),
      [entries, columns],
    );

    const openRepositories = useCallback(
      () =>
        navigation.navigate('MoreStack', {
          screen: 'SettingsStack',
          params: { screen: 'RespositorySettings' },
        }),
      [navigation],
    );

    const openBrowseSettings = useCallback(
      () => navigation.navigate('BrowseSettings'),
      [navigation],
    );

    const renderPluginCard = useCallback(
      (entry: PluginCardEntry, fillCard: boolean) => (
        <PluginCard
          key={entry.key}
          disabled={pendingPluginIds.has(entry.plugin.id)}
          onInstall={install}
          onOpenDetails={openDetails}
          onOpenWebsite={openWebsite}
          onUpdate={update}
          plugin={entry.plugin}
          status={entry.status}
          style={fillCard ? styles.cardFilled : styles.cardHalf}
          theme={theme}
        />
      ),
      [install, openDetails, openWebsite, pendingPluginIds, theme, update],
    );

    const renderItem = useCallback(
      ({ item }: LegendListRenderItemProps<PluginListRow>) => {
        if (item.type === 'card-row') {
          const fillCard = columns === 1 || item.entries.length > 1;
          return (
            <View style={styles.cardRow}>
              {item.entries.map(entry => renderPluginCard(entry, fillCard))}
            </View>
          );
        }

        if (item.type === 'header') {
          return (
            <View
              style={[
                styles.headerRow,
                item.action === 'updateAll' && styles.updateHeaderRow,
              ]}
            >
              <Text
                style={[
                  styles.sectionHeader,
                  { color: theme.onSurfaceVariant },
                ]}
              >
                {item.title}
              </Text>
              {item.action === 'updateAll' ? (
                <Button
                  compact
                  contentStyle={styles.updateAllButtonContent}
                  mode="contained-tonal"
                  onPress={updateAll}
                  style={styles.updateAllButton}
                  title={getString('browseScreen.updateAll')}
                />
              ) : null}
            </View>
          );
        }

        return renderPluginCard(item, true);
      },
      [columns, renderPluginCard, theme, updateAll],
    );

    const refresh = useCallback(async () => {
      setRefreshing(true);
      try {
        await refreshPlugins();
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error));
      } finally {
        setRefreshing(false);
      }
    }, [refreshPlugins]);

    return (
      <LegendList
        data={rows}
        estimatedItemSize={CARD_ESTIMATED_HEIGHT}
        getItemType={item => item.type}
        keyExtractor={item => item.key}
        ListEmptyComponent={
          <EmptyView
            description={
              searchText.trim()
                ? getString('browseScreen.noSearchResults')
                : getString('browseScreen.noPlugins')
            }
            actions={
              searchText.trim()
                ? undefined
                : [
                    {
                      iconName: 'source-repository',
                      onPress: openRepositories,
                      title: getString('browseScreen.repositories'),
                    },
                    {
                      iconName: 'tune',
                      onPress: openBrowseSettings,
                      title: getString('browseSettings'),
                    },
                  ]
            }
            theme={theme}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          columns > 1 && styles.listContentWide,
          !rows.length && styles.emptyList,
        ]}
        recycleItems
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[theme.onPrimary]}
            progressBackgroundColor={theme.primary}
          />
        }
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
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 48,
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
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingBottom: 4,
    paddingTop: 8,
  },
  updateAllButton: {
    borderRadius: 24,
  },
  updateAllButtonContent: {
    minHeight: 40,
    paddingHorizontal: 8,
  },
  updateHeaderRow: {
    minHeight: 64,
    paddingVertical: 8,
  },
});
