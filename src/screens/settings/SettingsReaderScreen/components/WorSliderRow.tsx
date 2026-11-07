// lnreader-ios/src/screens/settings/SettingsReaderScreen/components/WorSliderRow.tsx
//
// Labelled Slider row for the WOR settings tabs. Ranges mirror the engine's
// own dock sliders (worShell.js) so the settings screen can never produce a
// value the reader UI itself would reject.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Slider } from '@components';
import type { ThemeColors } from '@theme/types';

interface WorSliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  onValueChange: (value: number) => void;
  theme: ThemeColors;
}

const WorSliderRow: React.FC<WorSliderRowProps> = ({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onValueChange,
  theme,
}) => (
  <View style={styles.container}>
    <View style={styles.labelRow}>
      <Text style={[styles.label, { color: theme.onSurface }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.onSurfaceVariant }]}>
        {formatValue ? formatValue(value) : String(value)}
      </Text>
    </View>
    <Slider
      value={value}
      min={min}
      max={max}
      step={step}
      size="xs"
      showValueIndicator={false}
      formatValue={formatValue}
      onValueChange={onValueChange}
    />
  </View>
);

export default WorSliderRow;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
  },
  value: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
