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
import { getLocaleLanguageName } from '@utils/constants/languages';

import { PluginStatus } from '../utils/buildBrowseEntries';

interface PluginCardProps {
  disabled: boolean;
  onInstall: (plugin: PluginItem) => void;
  onOpenDetails: (plugin: PluginItem) => void;
  onOpenWebsite: (plugin: PluginItem) => void;
  onUpdate: (plugin: PluginItem) => void;
  plugin: PluginItem;
  status: PluginStatus;
  style?: StyleProp<ViewStyle>;
  theme: ThemeColors;
}

const PluginCard = memo(
  ({
    disabled,
    onInstall,
    onOpenDetails,
    onOpenWebsite,
    onUpdate,
    plugin,
    status,
    style,
    theme,
  }: PluginCardProps) => {
    const isInstalled = status !== 'available';

    return (
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
          accessibilityLabel={
            isInstalled
              ? getString('browseScreen.openPluginDetails', {
                  name: plugin.name,
                })
              : undefined
          }
          accessibilityRole={isInstalled ? 'button' : undefined}
          disabled={!isInstalled}
          style={styles.cardAction}
          android_ripple={
            isInstalled ? { color: theme.rippleColor } : undefined
          }
          onPress={() => onOpenDetails(plugin)}
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
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.description, { color: theme.onSurfaceVariant }]}
            >
              {`${getLocaleLanguageName(plugin.lang)} · ${plugin.version}`}
            </Text>
          </View>
        </View>
        {status === 'available' ? (
          <IconButtonV2
            accessibilityLabel={getString('browseScreen.openWebsite', {
              name: plugin.name,
            })}
            name="earth"
            color={theme.onSurfaceVariant}
            onPress={() => onOpenWebsite(plugin)}
            padding={10}
            theme={theme}
          />
        ) : (
          <IconButtonV2
            accessibilityLabel={getString('browseScreen.openPluginSettings', {
              name: plugin.name,
            })}
            name="cog-outline"
            color={theme.onSurfaceVariant}
            onPress={() => onOpenDetails(plugin)}
            padding={10}
            theme={theme}
          />
        )}
        {status !== 'installed' ? (
          <IconButtonV2
            accessibilityLabel={
              status === 'available'
                ? getString('browseScreen.installPlugin', {
                    name: plugin.name,
                  })
                : getString('browseScreen.updatePlugin', {
                    name: plugin.name,
                  })
            }
            name="download-outline"
            color={status === 'update' ? theme.primary : theme.onSurface}
            disabled={disabled}
            onPress={
              status === 'available'
                ? () => onInstall(plugin)
                : () => onUpdate(plugin)
            }
            padding={10}
            theme={theme}
          />
        ) : null}
      </View>
    );
  },
);

export default PluginCard;

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
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
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  details: {
    flex: 1,
    marginStart: 12,
    minWidth: 0,
  },
  icon: {
    borderRadius: 10,
    height: 52,
    width: 52,
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
