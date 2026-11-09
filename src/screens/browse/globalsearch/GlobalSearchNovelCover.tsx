import { StyleSheet, View, Text, Pressable } from 'react-native';
import { ThemeColors } from '@theme/types';
import { NovelItem } from '@plugins/types';
import { NovelCoverImage } from '@components';
import {
  useTitleMode,
  useTranslatedMetadata,
} from '@hooks/useTranslatedMetadata';
import { directionStyleFor } from '@utils/textDirection';

interface GlobalSearchNovelCoverProps {
  novel: NovelItem;
  theme: ThemeColors;
  onPress: () => void;
  inLibrary: boolean;
  onLongPress: () => void;
}

const GlobalSearchNovelCover = ({
  novel,
  theme,
  onPress,
  inLibrary,
  onLongPress,
}: GlobalSearchNovelCoverProps) => {
  const { name, cover } = novel;

  const uri = cover;

  const opacity = inLibrary ? 0.5 : 1;

  // Translated title (display-only — novel.name is never mutated). NovelItem
  // carries no pluginId, so translations use the shared metadata namespace.
  const titleMode = useTitleMode();
  const translatedName = useTranslatedMetadata(
    'title',
    titleMode === 'original' ? undefined : name,
    '',
    novel.path,
  );
  const showOriginalTitle =
    titleMode === 'both' && translatedName !== undefined;

  return (
    <View style={styles.container}>
      <Pressable
        android_ripple={{ color: theme.rippleColor }}
        style={styles.pressable}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <NovelCoverImage
          uri={uri}
          theme={theme}
          iconSize={34}
          style={[styles.novelCover, { opacity }]}
        />
        <Text
          numberOfLines={2}
          style={[
            styles.title,
            { color: theme.onSurface },
            directionStyleFor(translatedName ?? name),
          ]}
        >
          {translatedName ?? name}
        </Text>
        {showOriginalTitle ? (
          <Text
            numberOfLines={1}
            style={[
              styles.originalTitle,
              { color: theme.onSurfaceVariant },
              directionStyleFor(name),
            ]}
          >
            {name}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
};

export default GlobalSearchNovelCover;

const styles = StyleSheet.create({
  container: {
    borderRadius: 6,
    flex: 1,
    overflow: 'hidden',
  },
  novelCover: {
    borderRadius: 4,
    height: 150,
    width: 115,
  },
  pressable: {
    borderRadius: 4,
    flex: 1,
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  title: {
    flexWrap: 'wrap',
    fontFamily: 'pt-sans-bold',
    fontSize: 14,
    padding: 4,
    width: 115,
  },
  originalTitle: {
    fontSize: 12,
    paddingHorizontal: 4,
  },
});
