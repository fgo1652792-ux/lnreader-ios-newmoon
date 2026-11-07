import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcon from '@react-native-vector-icons/material-design-icons';

import type { ThemeColors } from '@theme/types';
import { getString } from '@i18n/translations';

interface ThemePreviewProps {
  /** The locally merged colors being edited (NOT the live app theme). */
  colors: ThemeColors;
  isDark: boolean;
}

/**
 * A mock mini-UI that renders the tokens being edited. It consumes the
 * color object passed by the editor (a local useMemo result), so dragging
 * in the picker never re-renders the rest of the app.
 */
const ThemePreview = ({ colors, isDark }: ThemePreviewProps) => {
  const preview = useMemo(
    () => ({
      appbar: { backgroundColor: colors.surface },
      card: { backgroundColor: colors.surfaceContainerHigh ?? colors.surface },
      chip: { backgroundColor: colors.secondaryContainer },
      dialog: { backgroundColor: colors.surfaceVariant },
    }),
    [colors],
  );

  return (
    <View
      accessibilityLabel={getString('themeStudio.preview.title')}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      {/* Fake appbar */}
      <View style={[styles.appbar, preview.appbar]}>
        <MaterialIcon name="arrow-left" size={18} color={colors.onSurface} />
        <Text style={[styles.appbarTitle, { color: colors.onSurface }]}>
          {getString('library')}
        </Text>
        <MaterialIcon name="magnify" size={18} color={colors.onSurface} />
      </View>

      {/* Fake list row */}
      <View style={[styles.card, preview.card]}>
        <View
          style={[styles.cover, { backgroundColor: colors.primaryContainer }]}
        >
          <MaterialIcon
            name="book-outline"
            size={18}
            color={colors.onPrimaryContainer}
          />
        </View>
        <View style={styles.cardText}>
          <Text
            numberOfLines={1}
            style={[styles.rowTitle, { color: colors.onSurface }]}
          >
            {isDark ? 'Re:Zero — Arc 4' : 'Overlord — Vol. 14'}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.rowSubtitle, { color: colors.onSurfaceVariant }]}
          >
            Chapter 108 · 24 min
          </Text>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.surfaceVariant },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.primary, width: '62%' },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Buttons + chip */}
      <View style={styles.actionsRow}>
        <View style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
            {getString('novelScreen.startReadingChapters')}
          </Text>
        </View>
        <View
          style={[
            styles.button,
            { backgroundColor: colors.secondaryContainer },
          ]}
        >
          <Text
            style={[styles.buttonText, { color: colors.onSecondaryContainer }]}
          >
            {getString('common.downloads')}
          </Text>
        </View>
        <View style={[styles.chip, preview.chip]}>
          <Text
            style={[styles.chipText, { color: colors.onSecondaryContainer }]}
          >
            {getString('novelScreen.continueReading')}
          </Text>
        </View>
      </View>

      {/* Fake dialog card */}
      <View style={[styles.dialog, preview.dialog]}>
        <Text style={[styles.dialogTitle, { color: colors.onSurface }]}>
          {getString('common.warning')}
        </Text>
        <Text style={[styles.dialogBody, { color: colors.onSurfaceVariant }]}>
          {getString('common.delete')}
        </Text>
        <View
          style={[styles.divider, { backgroundColor: colors.outlineVariant }]}
        />
        <View style={styles.dialogActions}>
          <Text style={[styles.dialogAction, { color: colors.primary }]}>
            {getString('common.cancel')}
          </Text>
          <Text style={[styles.dialogAction, { color: colors.error }]}>
            {getString('common.delete')}
          </Text>
        </View>
      </View>
    </View>
  );
};

export default React.memo(ThemePreview);

const styles = StyleSheet.create({
  root: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  appbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  appbarTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    margin: 10,
    padding: 10,
  },
  cover: {
    alignItems: 'center',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 34,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 11,
  },
  progressTrack: {
    borderRadius: 2,
    height: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  actionsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  button: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  dialog: {
    borderRadius: 12,
    margin: 10,
    marginTop: 0,
    padding: 12,
  },
  dialogTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  dialogBody: {
    fontSize: 12,
    marginBottom: 10,
    marginTop: 2,
  },
  divider: {
    height: 1,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  dialogAction: {
    fontSize: 12,
    fontWeight: '600',
  },
});
