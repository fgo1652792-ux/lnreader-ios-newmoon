import React from 'react';
import { StyleSheet, View } from 'react-native';

interface StorageBarProps {
  /** 0..1 — clamped internally. */
  fraction: number;
  color: string;
  trackColor: string;
  height?: number;
  rounded?: boolean;
}

/**
 * A thin proportional bar built from plain Views (no chart dependency).
 * Uses start/end so it mirrors correctly in RTL.
 */
const StorageBar: React.FC<StorageBarProps> = ({
  fraction,
  color,
  trackColor,
  height = 6,
  rounded = true,
}) => {
  const clamped = Math.min(1, Math.max(0, fraction || 0));
  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: trackColor,
          height,
          borderRadius: rounded ? height / 2 : 0,
        },
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            borderRadius: rounded ? height / 2 : 0,
            width: `${Math.round(clamped * 100)}%` as `${number}%`,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
  },
});

export default StorageBar;
