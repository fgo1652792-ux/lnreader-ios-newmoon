// lnreader-ios/src/screens/settings/SettingsReaderScreen/tabs/DisplayTab.tsx
//
// Display settings for the New Moon (WOR) engine. Every control writes the
// @wor_reader_settings_v4 shape (sections.ts DEFAULT_SETTINGS keys) via
// useWorSettings — the old classic-engine controls (textSize/padding/textAlign
// on CHAPTER_READER_SETTINGS) are gone because New Moon is the only visible
// reader engine.

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Portal } from 'react-native-paper';

import { List, SegmentedControl } from '@components';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';

import { type WorSettingsTabProps } from '../useWorSettings';
import WorSliderRow from '../components/WorSliderRow';
import WorFontPickerModal from '../Modals/WorFontPickerModal';
import { WOR_FONTS } from '../../../../reader/newmoon/worFonts';
import type { WorReaderSettings } from '@screens/reader/newmoon/NewMoonAdapter';

/** Engine slider ranges (worShell.js). */
const FONT_SIZE = { min: 14, max: 34, step: 1 };
const LINE_HEIGHT = { min: 1.5, max: 3, step: 0.1 };
const WORD_SPACING = { min: -2, max: 10, step: 1 };

const WEIGHT_OPTIONS = [
  { value: '300', label: getString('newMoon.settingsFontWeightLight') },
  { value: '400', label: getString('newMoon.settingsFontWeightNormal') },
  { value: '700', label: getString('newMoon.settingsFontWeightBold') },
];

const DIRECTION_OPTIONS = [
  { value: 'rtl', label: getString('newMoon.settingsDirectionRtl') },
  { value: 'center', label: getString('newMoon.settingsDirectionCenter') },
  { value: 'ltr', label: getString('newMoon.settingsDirectionLtr') },
];

const DisplayTab: React.FC<WorSettingsTabProps> = ({ settings, patch }) => {
  const theme = useTheme();
  const [fontPickerVisible, setFontPickerVisible] = useState(false);

  const currentFontName =
    WOR_FONTS.find(font => font.value === settings.fontValue)?.name ??
    settings.fontValue;

  return (
    <>
      <BottomSheetScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.content}>
          <WorSliderRow
            label={getString('newMoon.settingsFontSize')}
            value={settings.fontSize}
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            step={FONT_SIZE.step}
            formatValue={value => `${value} px`}
            onValueChange={value => patch({ fontSize: value })}
            theme={theme}
          />
          <WorSliderRow
            label={getString('newMoon.settingsLineHeight')}
            value={settings.lineHeight}
            min={LINE_HEIGHT.min}
            max={LINE_HEIGHT.max}
            step={LINE_HEIGHT.step}
            formatValue={value => value.toFixed(1)}
            onValueChange={value => patch({ lineHeight: value })}
            theme={theme}
          />
          <WorSliderRow
            label={getString('newMoon.settingsWordSpacing')}
            value={settings.wordSpacing}
            min={WORD_SPACING.min}
            max={WORD_SPACING.max}
            step={WORD_SPACING.step}
            formatValue={value => `${value} px`}
            onValueChange={value => patch({ wordSpacing: value })}
            theme={theme}
          />

          <View style={styles.subHeader}>
            <List.SubHeader theme={theme}>
              {getString('newMoon.settingsFontWeight')}
            </List.SubHeader>
          </View>
          <View style={styles.padded}>
            <SegmentedControl
              options={WEIGHT_OPTIONS}
              value={String(settings.fontWeight)}
              onChange={value => patch({ fontWeight: value })}
              theme={theme}
            />
          </View>

          <View style={styles.subHeader}>
            <List.SubHeader theme={theme}>
              {getString('newMoon.settingsDirection')}
            </List.SubHeader>
          </View>
          <View style={styles.padded}>
            <SegmentedControl
              options={DIRECTION_OPTIONS}
              value={settings.direction}
              onChange={value => patch({ direction: value })}
              theme={theme}
            />
          </View>

          <List.Item
            title={getString('newMoon.settingsFont')}
            description={currentFontName}
            onPress={() => setFontPickerVisible(true)}
            theme={theme}
          />
        </View>

        <View style={styles.bottomSpacing} />
      </BottomSheetScrollView>

      <Portal>
        <WorFontPickerModal
          visible={fontPickerVisible}
          onDismiss={() => setFontPickerVisible(false)}
          currentFont={settings.fontValue}
          onSelect={(fontValue: WorReaderSettings['fontValue']) =>
            patch({ fontValue })
          }
        />
      </Portal>
    </>
  );
};

export default DisplayTab;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  content: {
    paddingTop: 8,
  },
  subHeader: {
    marginTop: 8,
  },
  padded: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  bottomSpacing: {
    height: 24,
  },
});
