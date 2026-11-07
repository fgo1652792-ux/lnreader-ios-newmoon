import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TextInput } from 'react-native-paper';

import { Dialog } from '@components';
import { getString } from '@i18n/translations';
import {
  contrastRatio,
  formatContrast,
  hexToHsv,
  hsvToHex,
  normalizeHex,
} from '@theme/studio/color';
import type { ThemeColors } from '@theme/types';

interface ColorEditorModalProps {
  visible: boolean;
  /** Localized token label. */
  label: string;
  /** Effective color when the editor opened (target + drafts). */
  initialHex: string;
  /** Background the token is usually rendered against (for the hint). */
  partnerLabel?: string;
  partnerHex?: string;
  partnerMin?: number;
  theme: ThemeColors;
  onApply: (hex: string | null) => void;
  onDismiss: () => void;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Interactive HSV color editor: gradient pad + hue slider + hex field.
 * All drag state lives here — the parent only receives the final color on
 * "apply", so the app-wide theme never re-renders during a drag.
 */
const ColorEditorModal = ({
  visible,
  label,
  initialHex,
  partnerLabel,
  partnerHex,
  partnerMin,
  theme,
  onApply,
  onDismiss,
}: ColorEditorModalProps) => {
  // The parent remounts this editor per token (key={token}), so lazy
  // initializers are enough — no reset effect needed.
  const [hsv, setHsv] = useState(
    () => hexToHsv(initialHex) ?? { h: 0, s: 0, v: 1 },
  );
  const [hexText, setHexText] = useState(
    () => normalizeHex(initialHex) ?? initialHex,
  );
  const [hexError, setHexError] = useState(false);

  const liveHex = useMemo(() => hsvToHex(hsv), [hsv]);
  const hueHex = useMemo(() => hsvToHex({ h: hsv.h, s: 1, v: 1 }), [hsv.h]);

  const padSize = useRef({ width: 0, height: 0 });
  const hueWidth = useRef(0);

  const updateFromPad = useCallback((locationX: number, locationY: number) => {
    const { width, height } = padSize.current;
    if (width <= 0 || height <= 0) {
      return;
    }
    const s = clamp01(locationX / width);
    const v = 1 - clamp01(locationY / height);
    setHsv(prev => ({ ...prev, s, v }));
  }, []);

  const updateFromHue = useCallback((locationX: number) => {
    if (hueWidth.current <= 0) {
      return;
    }
    const h = clamp01(locationX / hueWidth.current) * 360;
    setHsv(prev => ({ ...prev, h }));
  }, []);

  const padPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: evt =>
          updateFromPad(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
        onPanResponderMove: evt =>
          updateFromPad(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
      }),
    [updateFromPad],
  );

  const huePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: evt => updateFromHue(evt.nativeEvent.locationX),
        onPanResponderMove: evt => updateFromHue(evt.nativeEvent.locationX),
      }),
    [updateFromHue],
  );

  const applyHexText = (text: string) => {
    const normalized = normalizeHex(text);
    if (normalized) {
      const parsed = hexToHsv(normalized);
      if (parsed) {
        setHsv(parsed);
      }
      setHexError(false);
    } else {
      setHexError(true);
    }
  };

  const contrast = useMemo(() => {
    if (!partnerHex || partnerMin === undefined) {
      return null;
    }
    const ratio = contrastRatio(liveHex, partnerHex);
    return { ratio, passes: ratio >= partnerMin };
  }, [liveHex, partnerHex, partnerMin]);

  return (
    <Dialog.Root visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>
        {getString('themeStudio.colorEditor.title', { token: label })}
      </Dialog.Title>
      <Dialog.Content>
        {/* HSV gradient pad */}
        <View
          onLayout={event => {
            padSize.current = {
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
            };
          }}
          style={[styles.pad, { borderColor: theme.outlineVariant }]}
          {...padPanResponder.panHandlers}
        >
          <LinearGradient
            colors={[hsvToHex({ h: hsv.h, s: 0, v: 1 }), hueHex]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.fill}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', '#000000']}
            style={styles.fill}
          />
          <View
            style={[
              styles.thumb,
              {
                backgroundColor: liveHex,
                borderColor: theme.background,
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
              },
            ]}
          />
        </View>

        {/* Hue slider */}
        <View
          onLayout={event => {
            hueWidth.current = event.nativeEvent.layout.width;
          }}
          style={[styles.hueTrack, { borderColor: theme.outlineVariant }]}
          {...huePanResponder.panHandlers}
        >
          <LinearGradient
            colors={[
              '#ff0000',
              '#ffff00',
              '#00ff00',
              '#00ffff',
              '#0000ff',
              '#ff00ff',
              '#ff0000',
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.fill}
          />
          <View
            style={[
              styles.hueThumb,
              {
                backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }),
                borderColor: theme.background,
                left: `${(hsv.h / 360) * 100}%`,
              },
            ]}
          />
        </View>

        {/* Current / new swatches */}
        <View style={styles.swatchRow}>
          <View style={styles.swatchBox}>
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: initialHex,
                  borderColor: theme.outlineVariant,
                },
              ]}
            />
            <Text
              style={[styles.swatchLabel, { color: theme.onSurfaceVariant }]}
            >
              {getString('themeStudio.colorEditor.current')}
            </Text>
          </View>
          <MaterialArrow theme={theme} />
          <View style={styles.swatchBox}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: liveHex, borderColor: theme.outlineVariant },
              ]}
            />
            <Text
              style={[styles.swatchLabel, { color: theme.onSurfaceVariant }]}
            >
              {getString('themeStudio.colorEditor.new')}
            </Text>
          </View>
        </View>

        {/* Hex field */}
        <TextInput
          value={hexText}
          mode="outlined"
          dense
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="ascii-capable"
          label={getString('themeStudio.colorEditor.hexLabel')}
          placeholder="#3399FF"
          error={hexError}
          onChangeText={text => {
            setHexText(text);
            if (normalizeHex(text)) {
              setHexError(false);
            }
          }}
          onEndEditing={() => applyHexText(hexText)}
          onSubmitEditing={() => applyHexText(hexText)}
          onBlur={() => applyHexText(hexText)}
          outlineColor={theme.outline}
          activeOutlineColor={theme.primary}
          textColor={theme.onSurface}
          style={styles.hexInput}
        />

        {/* Contrast hint */}
        {contrast && partnerLabel ? (
          <View style={styles.contrastRow}>
            <Text
              style={[
                styles.contrastText,
                { color: contrast.passes ? theme.primary : theme.error },
              ]}
            >
              {contrast.passes
                ? getString('themeStudio.colorEditor.contrastPasses', {
                    ratio: formatContrast(contrast.ratio),
                  })
                : getString('themeStudio.colorEditor.contrastFails', {
                    ratio: formatContrast(contrast.ratio),
                  })}
            </Text>
            <Text
              style={[
                styles.contrastPartner,
                { color: theme.onSurfaceVariant },
              ]}
            >
              {getString('themeStudio.contrast.pair', {
                fg: label,
                bg: partnerLabel,
              })}
            </Text>
          </View>
        ) : null}
      </Dialog.Content>
      <Dialog.Actions>
        <Dialog.Action
          title={getString('themeStudio.colorEditor.useDefault')}
          onPress={() => {
            onApply(null);
            onDismiss();
          }}
        />
        <Dialog.Action title={getString('common.cancel')} onPress={onDismiss} />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const normalized = normalizeHex(liveHex);
            if (normalized) {
              onApply(normalized);
              onDismiss();
            }
          }}
          style={[styles.applyButton, { backgroundColor: theme.primary }]}
        >
          <Text style={[styles.applyText, { color: theme.onPrimary }]}>
            {getString('common.save')}
          </Text>
        </Pressable>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

const MaterialArrow = ({ theme }: { theme: ThemeColors }) => (
  <Text style={[styles.arrow, { color: theme.onSurfaceVariant }]}>→</Text>
);

export default ColorEditorModal;

const styles = StyleSheet.create({
  pad: {
    borderRadius: 12,
    height: 160,
    overflow: 'hidden',
    borderWidth: 1,
  },
  fill: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  thumb: {
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
    width: 24,
  },
  hueTrack: {
    borderRadius: 10,
    height: 28,
    overflow: 'hidden',
    borderWidth: 1,
  },
  hueThumb: {
    borderRadius: 8,
    borderWidth: 2,
    height: 24,
    marginLeft: -8,
    marginTop: 2,
    position: 'absolute',
    width: 16,
  },
  swatchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  swatchBox: {
    alignItems: 'center',
    gap: 4,
  },
  swatch: {
    borderRadius: 10,
    borderWidth: 1,
    height: 40,
    width: 56,
  },
  swatchLabel: {
    fontSize: 11,
  },
  arrow: {
    fontSize: 18,
  },
  hexInput: {
    backgroundColor: 'transparent',
  },
  contrastRow: {
    gap: 2,
  },
  contrastText: {
    fontSize: 12,
    fontWeight: '600',
  },
  contrastPartner: {
    fontSize: 11,
  },
  applyButton: {
    alignItems: 'center',
    borderRadius: 20,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 16,
  },
  applyText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
