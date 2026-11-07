import { memo } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { IconButtonV2 } from '@components';
import { getString } from '@i18n/translations';
import { PluginItem } from '@plugins/types';
import { ThemeColors } from '@theme/types';

interface SourceCardProps {
  domain: string | null;
  isPinned: boolean;
  onLatestPress: (plugin: PluginItem) => void;
  onPinPress: (plugin: PluginItem) => void;
  onPress: (plugin: PluginItem) => void;
  plugin: PluginItem;
  style?: StyleProp<ViewStyle>;
  theme: ThemeColors;
}

const SourceCard = memo(
  ({
    domain,
    isPinned,
    onLatestPress,
    onPinPress,
    onPress,
    plugin,
    style,
    theme,
  }: SourceCardProps) => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surfaceContainerLow ?? theme.surface,
          borderColor: theme.outlineVariant,
        },
        style,
      ]}
    >
      <Pressable
        accessibilityLabel={`${getString('browse')} ${plugin.name}`}
        accessibilityRole="button"
        style={styles.cardAction}
        android_ripple={{ color: theme.rippleColor }}
        onPress={() => onPress(plugin)}
      />
      <View pointerEvents="none" style={styles.mainContent}>
        <Image
          source={{ uri: plugin.iconUrl }}
          style={[styles.icon, { backgroundColor: theme.surfaceVariant }]}
        />
        <View style={styles.details}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.name, { color: theme.onSurface }]}
          >
            {plugin.name}
          </Text>
          {domain ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.domain, { color: theme.onSurfaceVariant }]}
            >
              {domain}
            </Text>
          ) : null}
        </View>
      </View>
      <Pressable
        accessibilityLabel={`${getString('browseScreen.latest')} ${
          plugin.name
        }`}
        accessibilityRole="button"
        hitSlop={6}
        style={({ pressed }) => [
          styles.latestPill,
          { borderColor: theme.primary },
          pressed && styles.latestPillPressed,
        ]}
        onPress={() => onLatestPress(plugin)}
      >
        <Text style={[styles.latestText, { color: theme.primary }]}>
          {getString('browseScreen.latest')}
        </Text>
      </Pressable>
      <IconButtonV2
        accessibilityLabel={
          isPinned
            ? getString('browseScreen.unpinSource', { name: plugin.name })
            : getString('browseScreen.pinSource', { name: plugin.name })
        }
        name={isPinned ? 'pin' : 'pin-outline'}
        color={isPinned ? theme.primary : theme.onSurfaceVariant}
        onPress={() => onPinPress(plugin)}
        padding={10}
        theme={theme}
      />
    </View>
  ),
);

export default SourceCard;

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 76,
    overflow: 'hidden',
    padding: 12,
  },
  cardAction: {
    bottom: 0,
    end: 0,
    position: 'absolute',
    start: 0,
    top: 0,
  },
  details: {
    flex: 1,
    marginStart: 12,
    minWidth: 0,
  },
  domain: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  icon: {
    borderRadius: 10,
    height: 52,
    width: 52,
  },
  latestPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  latestPillPressed: {
    opacity: 0.6,
  },
  latestText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  mainContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
});
