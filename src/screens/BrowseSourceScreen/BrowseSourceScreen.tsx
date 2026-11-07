import { useCallback, useRef, useState, memo } from 'react';

import { FAB } from 'react-native-paper';
import { ErrorScreenV2, SafeAreaView, SearchbarV2 } from '@components/index';
import NovelList, { NovelListRenderItem } from '@components/NovelList';
import NovelCover from '@components/NovelCover';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import FilterBottomSheet from './components/FilterBottomSheet';

import { useSearch } from '@hooks';
import { useTheme } from '@hooks/persisted';
import { useBrowseSource, useSearchSource } from './useBrowseSource';

import { NovelItem, ImageRequestInit } from '@plugins/types';
import { getPlugin } from '@plugins/pluginManager';
import { getString } from '@i18n/translations';
import { StyleSheet } from 'react-native';
import { NovelInfo } from '@database/types';
import { ThemeColors } from '@theme/types';
import SourceScreenSkeletonLoading from '@screens/browse/loadingAnimation/SourceScreenSkeletonLoading';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrowseSourceScreenProps } from '@navigators/types';
import { useLibraryContext } from '@components/Context/LibraryContext';

interface SourceNovelRowProps {
  item: NovelItem;
  theme: ThemeColors;
  inLibrary: boolean;
  inActivity: boolean;
  addSkeletonLoading: boolean;
  imageRequestInit?: ImageRequestInit;
  navigateToNovel: (item: NovelItem | NovelInfo) => void;
  onAddToLibrary: (item: NovelItem) => void;
}

/**
 * Memoized grid cell: the source screen re-renders on every keystroke and
 * download-progress tick; without this row wrapper the inline closures
 * previously passed to NovelCover defeated its memo and re-rendered every
 * visible cover each time.
 */
const SourceNovelRow = memo(function SourceNovelRow_({
  item,
  theme,
  inLibrary,
  inActivity,
  addSkeletonLoading,
  imageRequestInit,
  navigateToNovel,
  onAddToLibrary,
}: SourceNovelRowProps) {
  const handlePress = useCallback(
    () => navigateToNovel(item),
    [navigateToNovel, item],
  );
  const handleLongPress = useCallback(
    () => onAddToLibrary(item),
    [onAddToLibrary, item],
  );

  return (
    <NovelCover
      item={item}
      theme={theme}
      libraryStatus={inLibrary}
      inActivity={inActivity}
      onPress={handlePress}
      isSelected={false}
      addSkeletonLoading={addSkeletonLoading}
      onLongPress={handleLongPress}
      hasSelection={false}
      imageRequestInit={imageRequestInit}
    />
  );
});

const BrowseSourceScreen = ({ route, navigation }: BrowseSourceScreenProps) => {
  const theme = useTheme();
  const { pluginId, pluginName, site, showLatestNovels } = route.params;
  const imageRequestInit = getPlugin(pluginId)?.imageRequestInit;

  const {
    isLoading,
    novels,
    hasNextPage,
    fetchNextPage,
    error,
    filterValues,
    setFilters,
    clearFilters,
    refetchNovels,
  } = useBrowseSource(pluginId, showLatestNovels);

  const {
    isSearching,
    searchResults,
    searchSource,
    searchNextPage,
    hasNextSearchPage,
    clearSearchResults,
    searchError,
  } = useSearchSource(pluginId);
  const novelList = searchResults.length > 0 ? searchResults : novels;
  const errorMessage = error || searchError;

  const { searchText, setSearchText, clearSearchbar } = useSearch();
  const onChangeText = useCallback(
    (text: string) => setSearchText(text),
    [setSearchText],
  );
  const onSubmitEditing = () => {
    searchSource(searchText);
  };
  const handleClearSearchbar = () => {
    clearSearchbar();
    clearSearchResults();
  };

  const handleOpenWebView = async () => {
    navigation.navigate('WebviewScreen', {
      name: pluginName,
      url: site,
      pluginId,
    });
  };

  const { novelInLibrary, switchNovelToLibrary } = useLibraryContext();
  const [inActivity, setInActivity] = useState<Record<string, boolean>>({});

  const navigateToNovel = useCallback(
    (item: NovelItem | NovelInfo) =>
      navigation.navigate('ReaderStack', {
        screen: 'Novel',
        params: {
          ...item,
          pluginId: pluginId,
        },
      }),
    [navigation, pluginId],
  );

  // Long-press adds the novel to the library; the row shows an in-progress
  // badge via the `inActivity` map keyed by path.
  const handleAddToLibrary = useCallback(
    async (item: NovelItem) => {
      setInActivity(prev => ({ ...prev, [item.path]: true }));

      await switchNovelToLibrary(item.path, pluginId);

      setInActivity(prev => ({ ...prev, [item.path]: false }));
    },
    [switchNovelToLibrary, pluginId],
  );

  const { bottom, right } = useSafeAreaInsets();
  const filterSheetRef = useRef<BottomSheetModalMethods | null>(null);

  // Skeleton rows at the tail while another page is loading — same
  // condition the footer uses. Kept in one place so renderItem can stay
  // referentially stable across keystrokes when it does not change.
  const showSkeletonRows = searchText ? hasNextSearchPage : hasNextPage;

  const renderItem = useCallback(
    ({ item }: { item: NovelItem }) => (
      <SourceNovelRow
        item={item}
        theme={theme}
        inLibrary={novelInLibrary(pluginId, item.path)}
        inActivity={Boolean(inActivity[item.path])}
        addSkeletonLoading={showSkeletonRows}
        imageRequestInit={imageRequestInit}
        navigateToNovel={navigateToNovel}
        onAddToLibrary={handleAddToLibrary}
      />
    ),
    [
      theme,
      novelInLibrary,
      pluginId,
      inActivity,
      showSkeletonRows,
      imageRequestInit,
      navigateToNovel,
      handleAddToLibrary,
    ],
  );

  const lastFetchDistanceRef = useRef(Infinity);
  const lastContentHeightRef = useRef(0);
  const lastOffsetYRef = useRef(-1);
  const handleScroll = useCallback(
    (event: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const distanceFromEnd =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const offsetMoved = contentOffset.y !== lastOffsetYRef.current;
      lastOffsetYRef.current = contentOffset.y;

      // A page appended (the end moved away). Re-arm the gate so the next user
      // scroll toward the end fetches again. Content-size-only events (offset
      // unchanged) never fetch on their own — that is what turned the old
      // onEndReached flow into a loop on sources that never return an empty
      // page (measured: htmlparser2 hot on every frame).
      if (contentSize.height !== lastContentHeightRef.current) {
        lastContentHeightRef.current = contentSize.height;
        if (offsetMoved) {
          lastFetchDistanceRef.current = Infinity;
        }
      }
      if (!offsetMoved) {
        return;
      }
      if (
        distanceFromEnd < layoutMeasurement.height * 1.5 &&
        distanceFromEnd < lastFetchDistanceRef.current
      ) {
        lastFetchDistanceRef.current = distanceFromEnd;
        if (searchText) {
          if (hasNextSearchPage) {
            searchNextPage();
          }
        } else if (hasNextPage) {
          fetchNextPage();
        }
      }
    },
    [searchText, hasNextSearchPage, searchNextPage, hasNextPage, fetchNextPage],
  );
  return (
    <SafeAreaView>
      <SearchbarV2
        searchText={searchText}
        leftIcon="magnify"
        placeholder={`${getString('common.search')} ${pluginName}`}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        clearSearchbar={handleClearSearchbar}
        handleBackAction={navigation.goBack}
        rightIcons={[{ iconName: 'earth', onPress: handleOpenWebView }]}
        theme={theme}
      />
      {isLoading || isSearching ? (
        <SourceScreenSkeletonLoading theme={theme} />
      ) : errorMessage || novelList.length === 0 ? (
        <ErrorScreenV2
          error={errorMessage || getString('sourceScreen.noResultsFound')}
          actions={[
            {
              iconName: 'refresh',
              title: getString('common.retry'),
              onPress: () => {
                if (searchText) {
                  searchSource(searchText);
                } else {
                  refetchNovels();
                }
              },
            },
          ]}
        />
      ) : (
        <NovelList
          data={novelList}
          inSource
          ListFooterComponent={
            (hasNextPage && !searchText) ||
            (hasNextSearchPage && Boolean(searchText)) ? (
              <SourceScreenSkeletonLoading theme={theme} completeRow={2} />
            ) : null
          }
          renderItem={renderItem as NovelListRenderItem}
          onScroll={handleScroll}
          scrollEventThrottle={32}
        />
      )}
      {!showLatestNovels && filterValues && !searchText ? (
        <>
          <FAB
            icon={'filter-variant'}
            style={[
              styles.filterFab,
              {
                backgroundColor: theme.primary,
                marginBottom: bottom + 16,
                marginEnd: right + 16,
              },
            ]}
            label={getString('common.filter')}
            uppercase={false}
            color={theme.onPrimary}
            onPress={() => filterSheetRef?.current?.present()}
          />
          <FilterBottomSheet
            filterSheetRef={filterSheetRef}
            filters={filterValues}
            setFilters={setFilters}
            clearFilters={clearFilters}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
};

export default BrowseSourceScreen;

const styles = StyleSheet.create({
  filterFab: {
    bottom: 0,
    margin: 16,
    position: 'absolute',
    end: 0,
  },
});
