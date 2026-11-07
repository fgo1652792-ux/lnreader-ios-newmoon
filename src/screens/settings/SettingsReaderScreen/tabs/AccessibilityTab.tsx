// lnreader-ios/src/screens/settings/SettingsReaderScreen/tabs/AccessibilityTab.tsx
//
// "Reading enhancements" for the New Moon (WOR) engine: text brightness and
// the single-pass coloring features (dialogue / markdown / brackets / custom
// marks). Structural keys (selected*Style, custom*Mark) are written through
// useWorSettings, which flags the rebuild so the preview re-sends the section
// HTML instead of reloading. The classic engine's TTS-voice pickers are gone —
// they only affected the old WebView reader.

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { TextInput, Portal } from 'react-native-paper';

import { List, SegmentedControl } from '@components/index';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import ReaderColorPickerModal from '@components/ColorPickerModal/ReaderColorPickerModal';

import { type WorSettingsTabProps } from '../useWorSettings';
import SettingSwitch from '../../components/SettingSwitch';
import WorSliderRow from '../components/WorSliderRow';
import { WOR_FORMAT_COLORS } from '../../../../reader/newmoon/worShell';

const SIZE = { min: 80, max: 150, step: 5 };
const BRIGHTNESS = { min: 0.4, max: 1.5, step: 0.05 };

/** Mark-pair labels for the style pickers (values = shell STYLE_MARKS keys). */
const STYLE_OPTIONS: {
  value: string;
  label: string;
}[] = [
  { value: 'all', label: getString('newMoon.settingsStyleAll') },
  { value: 'guillemets', label: '«»' },
  { value: 'curly', label: '“”' },
  { value: 'straight', label: '""' },
  { value: 'single', label: '‘’' },
];

type FormattingCardProps = {
  title: string;
  enabled: boolean;
  color: string;
  size: number;
  onToggle: () => void;
  onColor: (hex: string) => void;
  onSize: (value: number) => void;
  hideMarks: boolean;
  onHideMarks: () => void;
  hideMarksLabel: string;
};

/** One coloring feature: enable switch + color + size + hide-marks switch. */
const FormattingCard: React.FC<FormattingCardProps> = ({
  title,
  enabled,
  color,
  size,
  onToggle,
  onColor,
  onSize,
  hideMarks,
  onHideMarks,
  hideMarksLabel,
}) => {
  const theme = useTheme();
  const [colorModal, setColorModal] = useState(false);

  return (
    <View style={styles.card}>
      <SettingSwitch
        label={title}
        value={enabled}
        onPress={onToggle}
        theme={theme}
      />
      {enabled && (
        <>
          <ColorPreferenceRow
            label={getString('newMoon.settingsColor')}
            color={color}
            onPress={() => setColorModal(true)}
          />
          <WorSliderRow
            label={getString('newMoon.settingsSize')}
            value={size}
            min={SIZE.min}
            max={SIZE.max}
            step={SIZE.step}
            formatValue={value => `${Math.round(value)}%`}
            onValueChange={onSize}
            theme={theme}
          />
          <SettingSwitch
            label={hideMarksLabel}
            value={hideMarks}
            onPress={onHideMarks}
            theme={theme}
          />
        </>
      )}
      <Portal>
        <ReaderColorPickerModal
          title={title}
          visible={colorModal}
          color={color}
          otherColor={color}
          editedChannel="text"
          presets={WOR_FORMAT_COLORS}
          theme={theme}
          onConfirm={hex => onColor(hex)}
          onReset={() => onColor(color)}
          onDismiss={() => setColorModal(false)}
        />
      </Portal>
    </View>
  );
};

const ColorPreferenceRow: React.FC<{
  label: string;
  color: string;
  onPress: () => void;
}> = ({ label, color, onPress }) => {
  const theme = useTheme();
  return (
    <View style={styles.colorRow}>
      <Text style={[styles.colorLabel, { color: theme.onSurface }]}>
        {label}
      </Text>
      <Text
        onPress={onPress}
        style={[styles.colorValue, { color: theme.primary }]}
      >
        {color.toUpperCase()}
      </Text>
    </View>
  );
};

const AccessibilityTab: React.FC<WorSettingsTabProps> = ({
  settings,
  patch,
}) => {
  const theme = useTheme();

  return (
    <BottomSheetScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.section}>
        <List.SubHeader theme={theme}>
          {getString('newMoon.settingsBrightness')}
        </List.SubHeader>
        <WorSliderRow
          label={getString('newMoon.settingsBrightness')}
          value={settings.brightness}
          min={BRIGHTNESS.min}
          max={BRIGHTNESS.max}
          step={BRIGHTNESS.step}
          formatValue={value => value.toFixed(2)}
          onValueChange={value => patch({ brightness: value })}
          theme={theme}
        />
      </View>

      <View style={styles.section}>
        <List.SubHeader theme={theme}>
          {getString('newMoon.settingsSectionFormatting')}
        </List.SubHeader>

        <FormattingCard
          title={getString('newMoon.settingsDialogue')}
          enabled={settings.enableDialogue === true}
          color={settings.dialogueColor}
          size={settings.dialogueSize}
          onToggle={() => patch({ enableDialogue: !settings.enableDialogue })}
          onColor={hex => patch({ dialogueColor: hex })}
          onSize={value => patch({ dialogueSize: value })}
          hideMarks={settings.hideQuotes === true}
          onHideMarks={() => patch({ hideQuotes: !settings.hideQuotes })}
          hideMarksLabel={getString('newMoon.settingsHideQuotes')}
        />
        <View style={styles.padded}>
          <SegmentedControl
            options={STYLE_OPTIONS}
            value={settings.selectedQuoteStyle}
            onChange={value => patch({ selectedQuoteStyle: value })}
            theme={theme}
          />
        </View>

        <FormattingCard
          title={getString('newMoon.settingsMarkdown')}
          enabled={settings.enableMarkdown === true}
          color={settings.markdownColor}
          size={settings.markdownSize}
          onToggle={() => patch({ enableMarkdown: !settings.enableMarkdown })}
          onColor={hex => patch({ markdownColor: hex })}
          onSize={value => patch({ markdownSize: value })}
          hideMarks={settings.hideMarkdownMarks === true}
          onHideMarks={() =>
            patch({ hideMarkdownMarks: !settings.hideMarkdownMarks })
          }
          hideMarksLabel={getString('newMoon.settingsHideMarkdownMarks')}
        />
        <View style={styles.padded}>
          <SegmentedControl
            options={STYLE_OPTIONS}
            value={settings.selectedMarkdownStyle}
            onChange={value => patch({ selectedMarkdownStyle: value })}
            theme={theme}
          />
        </View>

        <FormattingCard
          title={getString('newMoon.settingsBracket')}
          enabled={settings.enableBracket === true}
          color={settings.bracketColor}
          size={settings.bracketSize}
          onToggle={() => patch({ enableBracket: !settings.enableBracket })}
          onColor={hex => patch({ bracketColor: hex })}
          onSize={value => patch({ bracketSize: value })}
          hideMarks={settings.hideBracketMarks === true}
          onHideMarks={() =>
            patch({ hideBracketMarks: !settings.hideBracketMarks })
          }
          hideMarksLabel={getString('newMoon.settingsHideBracketMarks')}
        />
        <View style={styles.padded}>
          <SegmentedControl
            options={STYLE_OPTIONS}
            value={settings.selectedBracketStyle}
            onChange={value => patch({ selectedBracketStyle: value })}
            theme={theme}
          />
        </View>

        <FormattingCard
          title={getString('newMoon.settingsCustomMarks')}
          enabled={settings.enableCustom === true}
          color={settings.customColor}
          size={settings.customSize}
          onToggle={() => patch({ enableCustom: !settings.enableCustom })}
          onColor={hex => patch({ customColor: hex })}
          onSize={value => patch({ customSize: value })}
          hideMarks={settings.hideCustomMarks === true}
          onHideMarks={() =>
            patch({ hideCustomMarks: !settings.hideCustomMarks })
          }
          hideMarksLabel={getString('newMoon.settingsHideCustomMarks')}
        />
        {settings.enableCustom === true && (
          <View style={styles.marksInputs}>
            <TextInput
              label={getString('newMoon.settingsCustomOpenMark')}
              mode="outlined"
              defaultValue={settings.customOpenMark}
              onChangeText={text =>
                // Structural key — the hook/preview handles the rebuild.
                patch({ customOpenMark: text })
              }
              style={styles.textInput}
              theme={{ colors: { ...theme } }}
            />
            <TextInput
              label={getString('newMoon.settingsCustomCloseMark')}
              mode="outlined"
              defaultValue={settings.customCloseMark}
              onChangeText={text => patch({ customCloseMark: text })}
              style={styles.textInput}
              theme={{ colors: { ...theme } }}
            />
          </View>
        )}
      </View>

      <View style={styles.bottomSpacing} />
    </BottomSheetScrollView>
  );
};

export default AccessibilityTab;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  section: {
    marginVertical: 8,
  },
  card: {
    marginVertical: 4,
  },
  padded: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  colorLabel: {
    fontSize: 16,
  },
  colorValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  marksInputs: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  textInput: {
    fontSize: 14,
  },
  bottomSpacing: {
    height: 24,
  },
});
