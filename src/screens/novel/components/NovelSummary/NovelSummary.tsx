import { getString } from '@i18n/translations';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { ThemeColors } from '@theme/types';
import { detectTextDirection } from '@utils/textDirection';

interface NovelSummaryProps {
  summary: string;
  isExpanded: boolean;
  theme: ThemeColors;
}

const NovelSummary: React.FC<NovelSummaryProps> = ({
  summary,
  isExpanded,
  theme,
}) => {
  const textColor = theme.onSurfaceVariant;

  const [expanded, setExpanded] = useState(isExpanded);
  const toggleExpanded = () => {
    if (summary) {
      setExpanded(!expanded);
    }
  };

  const bottom = expanded ? 0 : 4;
  const containerBottomPadding = expanded ? 24 : 8;
  const opacity = expanded ? 1 : 0.7;

  // The summary language is independent of the UI language: an Arabic novel
  // opened in an English UI (and vice versa) must render with its own
  // writing direction and paragraph alignment. An empty summary falls back
  // to the UI locale direction via detectTextDirection('').
  const direction = useMemo(() => detectTextDirection(summary), [summary]);
  const summaryTextStyle = useMemo(
    () => [
      styles.summaryText,
      {
        color: textColor,
        textAlign: direction === 'rtl' ? ('right' as const) : ('left' as const),
        writingDirection: direction,
      },
    ],
    [textColor, direction],
  );

  return (
    <Pressable
      style={[
        styles.summaryContainer,
        { paddingBottom: containerBottomPadding },
      ]}
      onPress={toggleExpanded}
    >
      <Text
        style={summaryTextStyle}
        numberOfLines={expanded ? Number.MAX_SAFE_INTEGER : 3}
      >
        {summary || getString('novelScreen.noSummary')}
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
          {/* Expand/collapse affordance: chevrons point up/down, which is
              direction-neutral, so the icon needs no RTL mirroring. The
              centered overlay (left/right = 0) is symmetric by design. */}
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            color={theme.onBackground}
            size={24}
            style={[{ backgroundColor: theme.background }, styles.icon]}
          />
        </View>
      ) : null}
    </Pressable>
  );
};

export default NovelSummary;

const styles = StyleSheet.create({
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
  summaryContainer: {
    marginBottom: 8,
    padding: 16,
    paddingTop: 8,
  },
  summaryText: {
    lineHeight: 20,
  },
});
