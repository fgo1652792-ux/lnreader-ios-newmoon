import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@hooks/persisted';
import { setToastListener } from '@utils/showToast';

const TOAST_DURATION_MS = 2500;

/**
 * Minimal in-app toast host for iOS (Android keeps using ToastAndroid).
 * Rendered once in App.tsx; every showToast() call fades a message in at
 * the bottom of the screen above the safe area.
 */
export const ToastHost: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setToastListener(text => setMessage(text));
    return () => setToastListener(null);
  }, []);

  useEffect(() => {
    if (!message) {
      return;
    }
    const timeout = setTimeout(
      () => setMessage(null),
      TOAST_DURATION_MS,
    );
    return () => clearTimeout(timeout);
  }, [message]);

  if (!message) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.container,
        { bottom: 56 + insets.bottom },
      ]}>
      <View
        style={[
          styles.toast,
          {
            backgroundColor: theme.onSurface,
          },
        ]}>
        <Text
          numberOfLines={3}
          style={[styles.text, { color: theme.surface }]}>
          {message}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    start: 0,
    end: 0,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
    paddingHorizontal: 24,
  },
  toast: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '100%',
    opacity: 0.95,
  },
  text: {
    fontSize: 14,
  },
});
