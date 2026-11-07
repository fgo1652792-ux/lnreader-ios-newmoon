import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import MaterialIcon from '@react-native-vector-icons/material-design-icons';
import Menu from '@components/Menu';
import { getString } from '@i18n/translations';
import type { StudioUserTheme } from '@theme/studio/overrides';
import type { ThemeColors } from '@theme/types';

interface UserThemesSectionProps {
  themes: StudioUserTheme[];
  activeId: string | undefined;
  theme: ThemeColors;
  onActivate: (id: string) => void;
  onRename: (theme: StudioUserTheme) => void;
  onDuplicate: (theme: StudioUserTheme) => void;
  onDelete: (theme: StudioUserTheme) => void;
}

/** Saved user themes with activate / rename / duplicate / delete. */
const UserThemesSection = ({
  themes,
  activeId,
  theme,
  onActivate,
  onRename,
  onDuplicate,
  onDelete,
}: UserThemesSectionProps) => {
  const [menuTheme, setMenuTheme] = useState<StudioUserTheme | null>(null);
  const dismissMenu = useCallback(() => setMenuTheme(null), []);

  if (themes.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={[styles.title, { color: theme.primary }]}>
          {getString('themeStudio.userThemes.title')}
        </Text>
        <Text style={[styles.empty, { color: theme.onSurfaceVariant }]}>
          {getString('themeStudio.userThemes.empty')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.primary }]}>
        {getString('themeStudio.userThemes.title')}
      </Text>
      <View style={[styles.body, { backgroundColor: theme.surfaceVariant }]}>
        {themes.map(item => {
          const isActive = item.id === activeId;
          return (
            <View key={item.id} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onActivate(item.id)}
                android_ripple={{ color: theme.rippleColor, foreground: true }}
                style={styles.rowPressable}
              >
                <View style={styles.rowTexts}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.name,
                      { color: isActive ? theme.primary : theme.onSurface },
                    ]}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={[styles.meta, { color: theme.onSurfaceVariant }]}
                  >
                    {Object.keys(item.light ?? {}).length +
                      Object.keys(item.dark ?? {}).length}{' '}
                    {getString('themeStudio.actions.overriddenBadge')}
                  </Text>
                </View>
                {isActive ? (
                  <MaterialIcon name="check" size={18} color={theme.primary} />
                ) : null}
              </Pressable>
              <View collapsable={false}>
                <Menu
                  visible={menuTheme?.id === item.id}
                  onDismiss={dismissMenu}
                  anchor={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={getString('common.moreOptions')}
                      hitSlop={8}
                      onPress={() => setMenuTheme(item)}
                      style={styles.menuAnchor}
                    >
                      <MaterialIcon
                        name="dots-vertical"
                        size={20}
                        color={theme.onSurfaceVariant}
                      />
                    </Pressable>
                  }
                >
                  <Menu.Item
                    title={getString('themeStudio.userThemes.rename')}
                    onPress={() => {
                      dismissMenu();
                      onRename(item);
                    }}
                  />
                  <Menu.Item
                    title={getString('themeStudio.userThemes.duplicate')}
                    onPress={() => {
                      dismissMenu();
                      onDuplicate(item);
                    }}
                  />
                  <Menu.Item
                    title={getString('common.delete')}
                    onPress={() => {
                      dismissMenu();
                      onDelete(item);
                    }}
                  />
                </Menu>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default UserThemesSection;

const styles = StyleSheet.create({
  section: {
    marginTop: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginStart: 4,
  },
  empty: {
    fontSize: 13,
    marginStart: 4,
  },
  body: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingLeft: 12,
  },
  rowPressable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minHeight: 56,
    paddingVertical: 8,
  },
  rowTexts: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontSize: 14,
  },
  meta: {
    fontSize: 11,
  },
  menuAnchor: {
    padding: 14,
  },
});
