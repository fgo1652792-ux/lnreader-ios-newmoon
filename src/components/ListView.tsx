import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';

import color from 'color';
import { ThemeColors } from '@theme/types';
import { NovelItem } from '@plugins/types';
import { NovelInfo } from '@database/types';
import NovelCoverImage from './NovelCoverImage';
import {
  useTitleMode,
  useTranslatedMetadata,
} from '@hooks/useTranslatedMetadata';
import { directionStyleFor } from '@utils/textDirection';

interface ListViewProps {
  item: NovelItem | NovelInfo;
  downloadBadge?: React.ReactNode;
  unreadBadge?: React.ReactNode;
  inLibraryBadge?: React.ReactNode;
  theme: ThemeColors;
  onPress: () => void;
  isSelected?: boolean;
  onLongPress?: () => void;
  continueReadingButton?: React.ReactNode;
  pluginId?: string;
}

const ListView = ({
  item,
  downloadBadge,
  unreadBadge,
  inLibraryBadge,
  theme,
  onPress,
  isSelected,
  onLongPress,
  continueReadingButton,
  pluginId,
}: ListViewProps) => {
  const fadedImage = { opacity: inLibraryBadge ? 0.5 : 1 };

  // Translated row title (display-only — item.name is never mutated). Rows
  // whose type carries a pluginId (DB novels) derive it automatically.
  const titleMode = useTitleMode();
  const novelPluginId = pluginId ?? ('pluginId' in item ? item.pluginId : '');
  const translatedName = useTranslatedMetadata(
    'title',
    titleMode === 'original' ? undefined : item.name,
    novelPluginId,
    item.path,
  );
  const showOriginalTitle =
    titleMode === 'both' && translatedName !== undefined;

  return (
    <Pressable
      android_ripple={{ color: theme.rippleColor }}
      style={[
        styles.listView,
        isSelected && {
          backgroundColor: color(theme.primary).alpha(0.12).string(),
        },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <NovelCoverImage
        uri={item.cover}
        theme={theme}
        iconSize={20}
        style={[styles.extensionIcon, fadedImage]}
      />
      {showOriginalTitle ? (
        <View style={styles.titleContainer}>
          <Text
            style={[
              { color: theme.onSurface },
              styles.stackedNovelName,
              directionStyleFor(translatedName),
            ]}
            numberOfLines={1}
          >
            {translatedName}
          </Text>
          <Text
            style={[
              { color: theme.onSurfaceVariant },
              styles.originalName,
              directionStyleFor(item.name),
            ]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
        </View>
      ) : (
        <Text
          style={[
            { color: theme.onSurface },
            styles.novelName,
            directionStyleFor(translatedName ?? item.name),
          ]}
          numberOfLines={1}
        >
          {translatedName ?? item.name}
        </Text>
      )}
      <View style={styles.badgeContainer}>
        {downloadBadge}
        {unreadBadge}
        {inLibraryBadge}
      </View>
      {continueReadingButton}
    </Pressable>
  );
};

export default ListView;

const styles = StyleSheet.create({
  badgeContainer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  extensionIcon: {
    borderRadius: 4,
    height: 40,
    width: 40,
  },
  listView: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  novelName: {
    flex: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    marginStart: 16,
    paddingEnd: 8,
  },
  titleContainer: {
    flex: 1,
    marginStart: 16,
    paddingEnd: 8,
  },
  stackedNovelName: {
    flexWrap: 'wrap',
    fontSize: 15,
  },
  originalName: {
    fontSize: 12,
    marginTop: 2,
  },
});
