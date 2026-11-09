import { getString } from '@i18n/translations';
import { forceMetadata } from '@services/translation';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { ThemeColors } from '@theme/types';
import { useTranslatedMetadata } from '@hooks/useTranslatedMetadata';
import { directionStyleFor } from '@utils/textDirection';

interface NovelSummaryProps {
  summary: string;
  isExpanded: boolean;
  theme: ThemeColors;
  pluginId?: string;
  novelPath?: string;
}

const NovelSummary: React.FC<NovelSummaryProps> = ({
  summary,
  isExpanded,
  theme,
  pluginId = '',
  novelPath = '',
}) => {
  const textColor = theme.onSurfaceVariant;

  const [expanded, setExpanded] = useState(isExpanded);
  const [showOriginal, setShowOriginal] = useState(false);
  // Timestamp of the last forced re-translation — a re-translation is in
  // flight while it is set and the translated text has not come back yet.
  const [retranslatedAt, setRetranslatedAt] = useState<number | null>(null);
  const toggleExpanded = () => {
    if (summary) {
      setExpanded(!expanded);
    }
  };

  // Translated summary (display-only — the original summary is never
  // mutated). undefined = not translated yet → keep the original visible and
  // hide the summary actions row.
  const translatedSummary = useTranslatedMetadata(
    'summary',
    summary,
    pluginId,
    novelPath,
  );

  const handleToggleSource = useCallback(() => {
    setShowOriginal(value => !value);
  }, []);

  const handleRetranslate = useCallback(() => {
    setRetranslatedAt(Date.now());
    // Re-queue ignoring the session dedupe; the original stays visible
    // until the fresh translation arrives.
    forceMetadata({ kind: 'summary', pluginId, novelPath, text: summary });
  }, [pluginId, novelPath, summary]);

  const bottom = expanded ? 0 : 4;
  const pressableBottomPadding = expanded ? 24 : 8;
  const opacity = expanded ? 1 : 0.7;
  const retranslating =
    retranslatedAt !== null && translatedSummary === undefined;
  const displayedSummary =
    translatedSummary !== undefined && !showOriginal
      ? translatedSummary
      : summary;

  // The summary follows the TEXT's language (Arabic summaries read RTL with
  // right alignment, English ones LTR) — the UI locale must not flip it.
  const directionStyle = directionStyleFor(displayedSummary);

  return (
    <View style={styles.summaryContainer}>
      <Pressable
        style={{ paddingBottom: pressableBottomPadding }}
        onPress={toggleExpanded}
      >
        <Text
          style={[styles.summaryText, directionStyle, { color: textColor }]}
          numberOfLines={expanded ? Number.MAX_SAFE_INTEGER : 3}
        >
          {displayedSummary || getString('novelScreen.noSummary')}
        </Text>
        {summary ? (
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: theme.background,
                bottom,
                opacity,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              color={theme.onBackground}
              size={24}
              style={[{ backgroundColor: theme.background }, styles.icon]}
            />
          </View>
        ) : null}
      </Pressable>
      {translatedSummary !== undefined ? (
        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            hitSlop={6}
            onPress={handleToggleSource}
            android_ripple={{ color: theme.rippleColor }}
            style={styles.actionButton}
          >
            <Text style={[styles.actionText, { color: theme.primary }]}>
              {showOriginal
                ? getString('novelScreen.showTranslatedSummary')
                : getString('novelScreen.showOriginalSummary')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            hitSlop={6}
            onPress={handleRetranslate}
            android_ripple={{ color: theme.rippleColor }}
            style={styles.actionButton}
          >
            <Text style={[styles.actionText, { color: theme.primary }]}>
              {getString('novelScreen.retranslateSummary')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {retranslating ? (
        <Text
          style={[styles.retranslatingText, { color: theme.onSurfaceVariant }]}
        >
          {getString('translationScreen.translatingSummary')}
        </Text>
      ) : null}
    </View>
  );
};

export default NovelSummary;

const styles = StyleSheet.create({
  actionButton: {
    borderRadius: 4,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  actionText: {
    fontSize: 12,
  },
  actionsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  icon: {
    borderRadius: 50,
  },
  iconContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  retranslatingText: {
    fontSize: 12,
    marginTop: 4,
  },
  summaryContainer: {
    marginBottom: 8,
    padding: 16,
    paddingTop: 8,
  },
  summaryText: {
    lineHeight: 20,
  },
});
