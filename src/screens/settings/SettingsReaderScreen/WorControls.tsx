// lnreader-ios/src/screens/settings/SettingsReaderScreen/WorControls.tsx
//
// Shared row/chip controls for the New Moon reader-settings tabs. Everything
// binds to the wor settings store (useWorSettings) — never to the retired
// classic CHAPTER_READER_SETTINGS.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Slider } from '@components/index';
import { ThemeColors } from '@theme/types';

export const WorSectionHeader: React.FC<{ label: string; theme: ThemeColors }> = ({
  label,
  theme,
}) => (
  <Text style={[styles.sectionHeader, { color: theme.primary }]}>{label}</Text>
);

interface WorSliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue?: (v: number) => string;
  onValueChange: (v: number) => void;
  theme: ThemeColors;
}

export const WorSliderRow: React.FC<WorSliderRowProps> = ({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onValueChange,
  theme,
}) => (
  <View style={styles.sliderRow}>
    <View style={styles.sliderHeader}>
      <Text style={[styles.sliderLabel, { color: theme.onSurface }]}>{label}</Text>
      <Text style={[styles.sliderValue, { color: theme.onSurfaceVariant }]}>
        {formatValue ? formatValue(value) : String(value)}
      </Text>
    </View>
    <Slider
      value={value}
      min={min}
      max={max}
      step={step}
      showValueIndicator={false}
      activeTrackColor={theme.primary}
      handleColor={theme.primary}
      onValueChange={onValueChange}
      style={styles.slider}
    />
  </View>
);

interface WorChipRowProps<T extends string | number> {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onSelect: (v: T) => void;
  theme: ThemeColors;
}

export function WorChipRow<T extends string | number>({
  label,
  options,
  value,
  onSelect,
  theme,
}: WorChipRowProps<T>) {
  return (
    <View style={styles.chipRow}>
      {label ? (
        <Text style={[styles.sliderLabel, { color: theme.onSurface }]}>{label}</Text>
      ) : null}
      <View style={styles.chipContainer}>
        {options.map(option => {
          const active = option.value === value;
          return (
            <Text
              key={String(option.value)}
              onPress={() => onSelect(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                {
                  backgroundColor: active
                    ? theme.primary
                    : theme.surfaceVariant,
                  color: active ? theme.onPrimary : theme.onSurfaceVariant,
                  borderColor: active ? theme.primary : theme.outlineVariant,
                },
              ]}
            >
              {option.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 14,
    marginBottom: 2,
    marginHorizontal: 16,
    textTransform: 'uppercase',
  },
  sliderRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  sliderValue: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  slider: {
    marginTop: 2,
  },
  chipRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
  },
});
