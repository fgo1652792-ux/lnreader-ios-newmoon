import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import MaterialIcon from '@react-native-vector-icons/material-design-icons';
import { getString } from '@i18n/translations';
import {
  contrastRatio,
  formatContrast,
  normalizeHex,
} from '@theme/studio/color';
import { CONTRAST_PAIRS } from '@theme/studio/tokens';
import type { ThemeColors } from '@theme/types';
import type { StringMap } from '@i18n/types';

interface ContrastPanelProps {
  /** Effective colors of the edited mode. */
  colors: ThemeColors;
  theme: ThemeColors;
}

/**
 * Inline WCAG AA check for the mode being edited: lists every checked
 * text/icon pair that misses its minimum ratio (4.5:1 normal text,
 * 3:1 icons/large text).
 */
const ContrastPanel = ({ colors, theme }: ContrastPanelProps) => {
  const failures = useMemo(
    () =>
      CONTRAST_PAIRS.flatMap(pair => {
        const fg = normalizeHex(colors[pair.fg]);
        const bg = normalizeHex(colors[pair.bg]);
        if (!fg || !bg) {
          return [];
        }
        const ratio = contrastRatio(fg, bg);
        return ratio < pair.min ? [{ pair, ratio, min: pair.min }] : [];
      }),
    [colors],
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.primary }]}>
        {getString('themeStudio.contrast.title')}
      </Text>
      <View style={[styles.body, { backgroundColor: theme.surfaceVariant }]}>
        {failures.length === 0 ? (
          <View style={styles.row}>
            <MaterialIcon name="check-circle" size={16} color={theme.primary} />
            <Text style={[styles.text, { color: theme.onSurface }]}>
              {getString('themeStudio.contrast.allGood')}
            </Text>
          </View>
        ) : (
          failures.map(({ pair, ratio, min }) => {
            const fgLabel = getString(
              `themeStudio.tokens.${pair.fg}` as keyof StringMap,
            );
            const bgLabel = getString(
              `themeStudio.tokens.${pair.bg}` as keyof StringMap,
            );
            return (
              <View key={`${pair.fg}-${pair.bg}`} style={styles.row}>
                <MaterialIcon
                  name="alert-circle"
                  size={16}
                  color={theme.error}
                />
                <View style={styles.texts}>
                  <Text style={[styles.text, { color: theme.onSurface }]}>
                    {getString('themeStudio.contrast.pair', {
                      fg: fgLabel,
                      bg: bgLabel,
                    })}
                    {' — '}
                    {formatContrast(ratio)}
                  </Text>
                  <Text style={[styles.sub, { color: theme.onSurfaceVariant }]}>
                    {pair.level === 'text'
                      ? getString('themeStudio.contrast.lowText')
                      : getString('themeStudio.contrast.lowIcon')}
                    {' · '}
                    {getString('themeStudio.contrast.needs', { min: min })}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
};

export default ContrastPanel;

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginStart: 4,
  },
  body: {
    borderRadius: 14,
    gap: 10,
    padding: 12,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  text: {
    fontSize: 13,
  },
  sub: {
    fontSize: 11,
  },
});
