import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  GestureResponderEvent,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { ThemeColors } from '@theme/types';

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T, event: GestureResponderEvent) => void;
  theme: ThemeColors;
  showCheckIcon?: boolean;
  showLabels?: boolean;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  theme,
  showCheckIcon = true,
  showLabels = true,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.container}>
      {options.map((option, index) => {
        const isSelected = value === option.value;
        const isFirst = index === 0;
        const isLast = index === options.length - 1;

        const buttonStyles = [
          styles.segment,
          isFirst && styles.segmentFirst,
          isLast && styles.segmentLast,
          !isFirst && !isLast && styles.segmentMiddle,
          {
            backgroundColor: isSelected
              ? theme.secondaryContainer
              : 'transparent',
            borderColor: theme.outline,
          },
        ];

        const textColor = isSelected
          ? theme.onSecondaryContainer
          : theme.onSurface;

        return (
          <View key={option.value} style={buttonStyles}>
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              style={styles.segmentPressable}
              onPress={e => onChange(option.value, e)}
              android_ripple={{
                color: theme.rippleColor,
                borderless: false,
              }}
            >
              {showCheckIcon && isSelected && (
                <MaterialCommunityIcons
                  name="check"
                  size={18}
                  color={textColor}
                  style={styles.checkIcon}
                />
              )}
              {option.icon && (!isSelected || !showCheckIcon) && (
                <MaterialCommunityIcons
                  name={option.icon}
                  size={18}
                  color={textColor}
                  style={showLabels ? styles.icon : undefined}
                />
              )}
              {showLabels ? (
                <Text style={[styles.segmentText, { color: textColor }]}>
                  {option.label}
                </Text>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 40,
  },
  segment: {
    flex: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    overflow: 'hidden',
  },
  // Border sides and corner radii use logical (start/end) properties so the
  // segmented outline mirrors correctly under RTL; values are identical to
  // left/right in LTR.
  segmentFirst: {
    borderStartWidth: 1,
    borderEndWidth: 1,
    borderTopStartRadius: 20,
    borderBottomStartRadius: 20,
  },
  segmentMiddle: {
    borderEndWidth: 1,
  },
  segmentLast: {
    borderEndWidth: 1,
    borderTopEndRadius: 20,
    borderBottomEndRadius: 20,
  },
  segmentPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  checkIcon: {
    marginEnd: 8,
  },
  icon: {
    marginEnd: 8,
  },
});
