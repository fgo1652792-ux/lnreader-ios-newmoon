import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NovelCoverImage } from '@components';
import { ThemeColors } from '@theme/types';
import {
  useTitleMode,
  useTranslatedMetadata,
} from '@hooks/useTranslatedMetadata';
import { directionStyleFor } from '@utils/textDirection';

interface Props {
  novel: {
    novelName: string;
    novelCover: string;
    score: string;
    info: string[];
  };
  onPress: () => void;
  theme: ThemeColors;
  pluginId?: string;
}

const DiscoverNovelCard: React.FC<Props> = ({
  novel,
  onPress,
  theme,
  pluginId = '',
}) => {
  // Translated card title (display-only — novel.novelName is never mutated).
  // Tracker cards have no novel path; the pluginId distinguishes AniList/MAL.
  const titleMode = useTitleMode();
  const translatedName = useTranslatedMetadata(
    'title',
    titleMode === 'original' ? undefined : novel.novelName,
    pluginId,
    '',
  );
  const showOriginalTitle =
    titleMode === 'both' && translatedName !== undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.overlay3 }]}>
      <Pressable
        style={styles.pressable}
        onPress={onPress}
        android_ripple={{ color: theme.rippleColor }}
      >
        <NovelCoverImage
          uri={novel.novelCover}
          theme={theme}
          iconSize={32}
          style={styles.cover}
        />
        <View style={styles.infoContainer}>
          <Text
            style={[
              styles.title,
              { color: theme.onSurface },
              directionStyleFor(translatedName ?? novel.novelName),
            ]}
            numberOfLines={2}
          >
            {translatedName ?? novel.novelName}
          </Text>
          {showOriginalTitle ? (
            <Text
              style={[
                styles.originalTitle,
                { color: theme.onSurfaceVariant },
                directionStyleFor(novel.novelName),
              ]}
              numberOfLines={1}
            >
              {novel.novelName}
            </Text>
          ) : null}
          <Text style={[styles.small, { color: theme.onSurface }]}>
            Score:{' '}
            <Text style={{ color: theme.onSurfaceVariant }}>{novel.score}</Text>
          </Text>
          {novel?.info?.[1] ? (
            <Text style={[styles.small, { color: theme.onSurface }]}>
              Type:{' '}
              <Text style={{ color: theme.onSurfaceVariant }}>
                {novel.info[1]}
              </Text>
            </Text>
          ) : null}
          {novel?.info?.[2] ? (
            <Text style={[styles.small, { color: theme.onSurface }]}>
              Published:{' '}
              <Text style={{ color: theme.onSurfaceVariant }}>
                {novel.info[2]}
              </Text>
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
};

export default DiscoverNovelCard;

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    flex: 1,
    margin: 8,
  },
  cover: {
    borderBottomLeftRadius: 8,
    borderTopLeftRadius: 8,
    width: 100,
  },
  infoContainer: {
    flex: 1,
    padding: 16,
  },
  pressable: {
    flex: 1,
    flexDirection: 'row',
  },
  small: {
    fontSize: 12,
    marginVertical: 4,
  },
  title: {
    fontSize: 16,
    marginBottom: 4,
  },
  originalTitle: {
    fontSize: 12,
    marginBottom: 4,
  },
});
