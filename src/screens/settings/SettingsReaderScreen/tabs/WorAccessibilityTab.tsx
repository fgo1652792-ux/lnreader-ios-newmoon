// lnreader-ios/src/screens/settings/SettingsReaderScreen/tabs/WorAccessibilityTab.tsx
//
// TTS preferences for the New Moon reader's native speech bar (expo-speech).
// The voice engine/rate/pitch are read from the legacy TTS store (kept
// compatible), so existing users keep their voice settings.

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  useChapterReaderSettings,
  useTheme,
} from '@hooks/persisted';
import { getString } from '@i18n/translations';

import { WorSectionHeader, WorSliderRow } from '../WorControls';

const WorAccessibilityTab: React.FC = () => {
  const theme = useTheme();
  const readerSettings = useChapterReaderSettings();
  const { tts } = readerSettings;
  const { setChapterReaderSettings } = readerSettings;

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <WorSectionHeader
        theme={theme}
        label={getString('newMoon.settings.ttsSection')}
      />
      <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
        {getString('newMoon.settings.ttsHint')}
      </Text>
      <WorSliderRow
        theme={theme}
        label={getString('newMoon.settings.ttsRate')}
        value={tts?.rate ?? 1}
        min={0.5}
        max={2}
        step={0.05}
        formatValue={v => `×${v.toFixed(2)}`}
        onValueChange={v =>
          setChapterReaderSettings({ tts: { ...tts, rate: v } })
        }
      />
      <WorSliderRow
        theme={theme}
        label={getString('newMoon.settings.ttsPitch')}
        value={tts?.pitch ?? 1}
        min={0.5}
        max={2}
        step={0.05}
        formatValue={v => `×${v.toFixed(2)}`}
        onValueChange={v =>
          setChapterReaderSettings({ tts: { ...tts, pitch: v } })
        }
      />
      <View style={styles.footerSpace} />
    </ScrollView>
  );
};

export default WorAccessibilityTab;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 24 },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  footerSpace: { height: 8 },
});
