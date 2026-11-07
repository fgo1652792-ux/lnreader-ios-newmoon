import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import MaterialIcon from '@react-native-vector-icons/material-design-icons';
import { getString } from '@i18n/translations';
import type { StringMap } from '@i18n/types';
import type { ThemePreset } from '@theme/studio/presets';
import type { ThemeColors } from '@theme/types';

interface PresetsSectionProps {
  presets: readonly ThemePreset[];
  activeId: string | undefined;
  theme: ThemeColors;
  onSelect: (presetId: string) => void;
  onDeactivate: () => void;
}

/** Horizontal rail of built-in presets (light + dark palette dots each). */
const PresetsSection = ({
  presets,
  activeId,
  theme,
  onSelect,
  onDeactivate,
}: PresetsSectionProps) => {
  const items = useMemo(
    () =>
      presets.map(preset => ({
        preset,
        label: getString(
          `themeStudio.presets.${preset.key}` as keyof StringMap,
        ),
      })),
    [presets],
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.primary }]}>
        {getString('themeStudio.presets.title')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {/* "None" — back to the plain app theme */}
        <PresetCard
          label={getString('themeStudio.presets.off')}
          colors={[theme.primary, theme.secondary, theme.background]}
          active={!activeId}
          theme={theme}
          onPress={onDeactivate}
        />
        {items.map(({ preset, label }) => (
          <PresetCard
            key={preset.id}
            label={label}
            colors={[
              preset.light?.primary ?? theme.primary,
              preset.dark?.background ?? theme.surface,
              preset.light?.background ?? theme.background,
            ]}
            active={activeId === preset.id}
            theme={theme}
            onPress={() => onSelect(preset.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const PresetCard = ({
  label,
  colors,
  active,
  theme,
  onPress,
}: {
  label: string;
  colors: string[];
  active: boolean;
  theme: ThemeColors;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ checked: active }}
    onPress={onPress}
    style={[
      styles.card,
      { backgroundColor: theme.surfaceVariant },
      active && { borderColor: theme.primary, borderWidth: 2 },
    ]}
  >
    <View style={styles.dots}>
      {colors.map((color, index) => (
        <View key={index} style={[styles.dot, { backgroundColor: color }]} />
      ))}
    </View>
    <View style={styles.cardLabelRow}>
      {active ? (
        <MaterialIcon name="check" size={14} color={theme.primary} />
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          styles.cardLabel,
          { color: active ? theme.primary : theme.onSurface },
        ]}
      >
        {label}
      </Text>
    </View>
  </Pressable>
);

export default PresetsSection;

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
  rail: {
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  card: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 96,
  },
  dots: {
    flexDirection: 'row',
  },
  dot: {
    borderRadius: 10,
    height: 20,
    marginStart: -6,
    width: 20,
  },
  cardLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    maxWidth: 110,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
});
