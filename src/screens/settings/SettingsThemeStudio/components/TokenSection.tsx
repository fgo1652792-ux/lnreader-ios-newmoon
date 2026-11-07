import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import MaterialIcon from '@react-native-vector-icons/material-design-icons';
import { getString } from '@i18n/translations';
import type { StringMap } from '@i18n/types';
import {
  contrastRatio,
  formatContrast,
  normalizeHex,
} from '@theme/studio/color';
import {
  TOKEN_CONTRAST_PARTNER,
  type ThemeColorToken,
  type TokenGroup,
} from '@theme/studio/tokens';
import type { ThemeColors } from '@theme/types';

interface TokenRowProps {
  token: ThemeColorToken;
  /** Effective color (target + drafts) for the row swatch. */
  color: string;
  overridden: boolean;
  /** Effective colors of the edited mode, for the inline contrast check. */
  effectiveColors: ThemeColors;
  theme: ThemeColors;
  onPress: () => void;
}

const TokenRow = ({
  token,
  color,
  overridden,
  effectiveColors,
  theme,
  onPress,
}: TokenRowProps) => {
  const label = getString(`themeStudio.tokens.${token}` as keyof StringMap);

  const warning = useMemo(() => {
    const pair = TOKEN_CONTRAST_PARTNER[token];
    if (!pair) {
      return null;
    }
    const fg = normalizeHex(effectiveColors[pair.fg]);
    const bg = normalizeHex(effectiveColors[pair.bg]);
    if (!fg || !bg) {
      return null;
    }
    const ratio = contrastRatio(fg, bg);
    if (ratio >= pair.min) {
      return null;
    }
    return {
      ratio: formatContrast(ratio),
      min: pair.min,
      messageKey:
        pair.level === 'text'
          ? 'themeStudio.contrast.lowText'
          : 'themeStudio.contrast.lowIcon',
    };
  }, [effectiveColors, token]);

  const valueHex = normalizeHex(color);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${valueHex ?? ''}`}
      onPress={onPress}
      android_ripple={{
        color: theme.rippleColor ?? theme.primary,
        foreground: true,
      }}
      style={styles.row}
    >
      <View
        style={[
          styles.swatch,
          { backgroundColor: color, borderColor: theme.outlineVariant },
        ]}
      />
      <View style={styles.texts}>
        <Text style={[styles.label, { color: theme.onSurface }]}>{label}</Text>
        {warning ? (
          <View style={styles.warningRow}>
            <MaterialIcon name="alert-circle" size={12} color={theme.error} />
            <Text style={[styles.warningText, { color: theme.error }]}>
              {getString(warning.messageKey as keyof StringMap)}
            </Text>
          </View>
        ) : (
          <Text style={[styles.value, { color: theme.onSurfaceVariant }]}>
            {valueHex ?? '—'}
          </Text>
        )}
      </View>
      {overridden ? (
        <View
          accessibilityLabel={getString('themeStudio.actions.overriddenBadge')}
          style={[styles.badge, { backgroundColor: theme.secondaryContainer }]}
        >
          <Text
            style={[styles.badgeText, { color: theme.onSecondaryContainer }]}
          >
            {getString('themeStudio.actions.overriddenBadge')}
          </Text>
        </View>
      ) : null}
      <MaterialIcon
        name="chevron-right"
        size={20}
        color={theme.onSurfaceVariant}
      />
    </Pressable>
  );
};

interface TokenSectionProps {
  group: TokenGroup;
  effectiveColors: ThemeColors;
  isOverridden: (token: ThemeColorToken) => boolean;
  theme: ThemeColors;
  onPressToken: (token: ThemeColorToken) => void;
}

export const TokenSection = ({
  group,
  effectiveColors,
  isOverridden,
  theme,
  onPressToken,
}: TokenSectionProps) => {
  const handlePress = useCallback(
    (token: ThemeColorToken) => () => onPressToken(token),
    [onPressToken],
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.primary }]}>
        {getString(`themeStudio.groups.${group.titleKey}` as keyof StringMap)}
      </Text>
      <View
        style={[styles.sectionBody, { backgroundColor: theme.surfaceVariant }]}
      >
        {group.tokens.map(token => (
          <TokenRow
            key={token}
            token={token}
            color={effectiveColors[token] ?? theme.surface}
            overridden={isOverridden(token)}
            effectiveColors={effectiveColors}
            theme={theme}
            onPress={handlePress(token)}
          />
        ))}
      </View>
    </View>
  );
};

export default React.memo(TokenSection);

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginStart: 4,
  },
  sectionBody: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  swatch: {
    borderRadius: 8,
    borderWidth: 1,
    height: 30,
    width: 44,
  },
  texts: {
    flex: 1,
    gap: 1,
  },
  label: {
    fontSize: 14,
  },
  value: {
    fontSize: 12,
  },
  warningRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  warningText: {
    flexShrink: 1,
    fontSize: 11,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
