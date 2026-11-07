// lnreader-ios/src/screens/settings/SettingsReaderScreen/tabs/ThemeTab.tsx
//
// Theme settings for the New Moon (WOR) engine. Presets are the engine's own
// THEME_CYCLE (sections.ts); picking a preset also clears customColors, while
// picking a manual color sets customColors=true — the exact semantics the
// shell's dock uses.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Portal } from 'react-native-paper';

import { ColorPreferenceItem, List } from '@components/index';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import ReaderColorPickerModal from '@components/ColorPickerModal/ReaderColorPickerModal';
import type { ThemeColors } from '@theme/types';

import { type WorSettingsTabProps } from '../useWorSettings';
import { THEME_CYCLE } from '../../../../reader/newmoon/sections';

/** THEME_CYCLE bgPreset → translation key (labels are engine preset names). */
const PRESET_LABEL_KEYS = {
  black: 'newMoon.settingsThemeBlack',
  __light__: 'newMoon.settingsThemeLight',
  soft: 'newMoon.settingsThemeSoft',
  charcoal: 'newMoon.settingsThemeCharcoal',
} as const;

/** Comfortable single-color presets for each channel. */
const BACKGROUND_PRESETS = [
  '#000000',
  '#0b0b0b',
  '#16181d',
  '#232323',
  '#2e2e2e',
  '#f3efe7',
  '#FFFFFF',
  '#F7DFC6',
  '#DCE5E2',
  '#CCE8CF',
];

const TEXT_PRESETS = [
  '#ffffff',
  '#eef1f6',
  '#f3f3f3',
  '#1c1c1c',
  '#111111',
  '#4A3B2A',
  '#8D6E63',
  '#CCCCCC',
  '#9E9E9E',
  '#4ade80',
];

/** Round swatch for a THEME_CYCLE preset. */
const PresetSwatch: React.FC<{
  color: string;
  label: string;
  active: boolean;
  onPress: () => void;
  theme: ThemeColors;
}> = ({ color, label, active, onPress, theme }) => (
  <Pressable
    style={styles.swatch}
    android_ripple={{ color: theme.rippleColor }}
    onPress={onPress}
  >
    <View
      style={[
        styles.swatchPreview,
        {
          backgroundColor: color,
          borderColor: active ? theme.primary : theme.outline,
        },
      ]}
    />
    <Text
      numberOfLines={1}
      style={[
        styles.swatchLabel,
        { color: active ? theme.primary : theme.onSurface },
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

const ThemeTab: React.FC<WorSettingsTabProps> = ({ settings, patch }) => {
  const theme = useTheme();
  const [backgroundModal, setBackgroundModal] = useState(false);
  const [textModal, setTextModal] = useState(false);
  const [accentModal, setAccentModal] = useState(false);

  const selectPreset = (preset: (typeof THEME_CYCLE)[number]) =>
    patch({
      bgPreset: preset.bgPreset,
      bgColor: preset.bgColor,
      textColor: preset.textColor,
      customColors: false,
    });

  return (
    <>
      <BottomSheetScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.section}>
          <List.SubHeader theme={theme}>
            {getString('newMoon.settingsThemePreset')}
          </List.SubHeader>
          <View style={styles.presetRow}>
            {THEME_CYCLE.map(preset => {
              const active = settings.bgPreset === preset.bgPreset && !settings.customColors;
              const labelKey =
                PRESET_LABEL_KEYS[preset.bgPreset as keyof typeof PRESET_LABEL_KEYS];
              return (
                <PresetSwatch
                  key={preset.bgPreset}
                  color={preset.bgColor}
                  label={
                    labelKey
                      ? getString(labelKey)
                      : preset.bgPreset
                  }
                  active={active}
                  onPress={() => selectPreset(preset)}
                  theme={theme}
                />
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <List.SubHeader theme={theme}>
            {getString('newMoon.settingsCustomColorsTitle')}
          </List.SubHeader>
          <ColorPreferenceItem
            label={getString('newMoon.settingsBgColor')}
            description={settings.bgColor}
            onPress={() => setBackgroundModal(true)}
            theme={theme}
          />
          <ColorPreferenceItem
            label={getString('newMoon.settingsTextColor')}
            description={settings.textColor}
            onPress={() => setTextModal(true)}
            theme={theme}
          />
          <ColorPreferenceItem
            label={getString('newMoon.settingsAccent')}
            description={settings.accent}
            onPress={() => setAccentModal(true)}
            theme={theme}
          />
        </View>

        <View style={styles.bottomSpacing} />
      </BottomSheetScrollView>

      <Portal>
        <ReaderColorPickerModal
          title={getString('newMoon.settingsBgColor')}
          visible={backgroundModal}
          color={settings.bgColor}
          otherColor={settings.textColor}
          editedChannel="background"
          presets={BACKGROUND_PRESETS}
          theme={theme}
          onConfirm={hex => patch({ bgColor: hex, customColors: true })}
          onReset={() =>
            patch({
              bgPreset: THEME_CYCLE[0].bgPreset,
              bgColor: THEME_CYCLE[0].bgColor,
              textColor: THEME_CYCLE[0].textColor,
              customColors: false,
            })
          }
          onDismiss={() => setBackgroundModal(false)}
        />
        <ReaderColorPickerModal
          title={getString('newMoon.settingsTextColor')}
          visible={textModal}
          color={settings.textColor}
          otherColor={settings.bgColor}
          editedChannel="text"
          presets={TEXT_PRESETS}
          theme={theme}
          onConfirm={hex => patch({ textColor: hex, customColors: true })}
          onReset={() =>
            patch({
              textColor: THEME_CYCLE[0].textColor,
              customColors: false,
            })
          }
          onDismiss={() => setTextModal(false)}
        />
        <ReaderColorPickerModal
          title={getString('newMoon.settingsAccent')}
          visible={accentModal}
          color={settings.accent}
          otherColor={settings.bgColor}
          editedChannel="text"
          presets={TEXT_PRESETS}
          theme={theme}
          onConfirm={hex => patch({ accent: hex, customColors: true })}
          onReset={() =>
            patch({
              accent: '#808080',
              bgColor: settings.bgColor,
              textColor: settings.textColor,
            })
          }
          onDismiss={() => setAccentModal(false)}
        />
      </Portal>
    </>
  );
};

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
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  swatch: {
    alignItems: 'center',
    borderRadius: 12,
    padding: 10,
    minWidth: 76,
  },
  swatchPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
  },
  swatchLabel: {
    fontSize: 12,
    marginTop: 6,
  },
  bottomSpacing: {
    height: 24,
  },
});

export default ThemeTab;
