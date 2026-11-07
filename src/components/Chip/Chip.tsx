import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemeColors } from '../../theme/types';
import { detectTextDirection } from '../../utils/textDirection';

interface ChipProps {
  label: string;
  theme: ThemeColors;
}

const Chip: React.FC<ChipProps> = ({ label, theme }) => (
  <View
    style={[
      styles.chipContainer,
      {
        backgroundColor: theme.secondaryContainer,
      },
    ]}
  >
    <Pressable
      android_ripple={{ color: theme.rippleColor }}
      style={styles.pressable}
    >
      <Text
        style={[
          styles.label,
          {
            color: theme.onSecondaryContainer,
            // Genre names follow the content language, not the UI language.
            writingDirection: detectTextDirection(label),
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  </View>
);

export default Chip;

const styles = StyleSheet.create({
  chipContainer: {
    borderRadius: 8,
    height: 32,
    marginEnd: 8,
    overflow: 'hidden',
  },
  label: {
    fontSize: 14,
  },
  pressable: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
