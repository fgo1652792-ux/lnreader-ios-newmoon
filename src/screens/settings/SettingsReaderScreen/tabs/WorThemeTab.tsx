// lnreader-ios/src/screens/settings/SettingsReaderScreen/tabs/WorThemeTab.tsx
//
// New Moon theme settings: engine presets (incl. the light preset), custom
// background/text/accent colors, text brightness and the chapter progress
// bar. All values live in the wor settings store — the preview re-themes
// live without reloading its document.

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SwitchItem } from '@components/index';
import ColorPickerModal from '@components/ColorPickerModal/ColorPickerModal';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { useBoolean } from '@hooks';

import { WOR_BG_PRESETS } from '../../../../reader/newmoon/worShell';
import { isLightColor } from '../../../../reader/newmoon/sections';
import { useWorSettings, updateWorSettings } from '../../../reader/newmoon/worSettingsStore';
import { WorChipRow, WorSectionHeader, WorSliderRow } from '../WorControls';

type ColorChannel = 'bgColor' | 'textColor' | 'accent' | 'progressBarColor';

const WorThemeTab: React.FC = () => {
  const theme = useTheme();
  const settings = useWorSettings();

  const [channel, setChannel] = useState<ColorChannel>('bgColor');
  const pickerModal = useBoolean();

  const openPicker = (c: ColorChannel) => {
    setChannel(c);
    pickerModal.setTrue();
  };

  const presetOptions = [
    { value: '__light__', label: 'فاتح' },
    ...WOR_BG_PRESETS.map(p => ({ value: p.value, label: p.name })),
    { value: '__custom__', label: 'مخصص' },
  ];

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <WorSectionHeader
        theme={theme}
        label={getString('newMoon.settings.presets')}
      />
      <WorChipRow
        theme={theme}
        options={presetOptions}
        value={
          settings.customColors
            ? '__custom__'
            : settings.bgPreset === '__light__'
            ? '__light__'
            : settings.bgPreset
        }
        onSelect={v => {
          if (v === '__custom__') {
            updateWorSettings({ customColors: true });
            return;
          }
          const preset = WOR_BG_PRESETS.find(p => p.value === v);
          if (preset) {
            updateWorSettings({
              customColors: false,
              bgPreset: preset.value,
              bgColor: preset.bg,
              textColor: preset.text,
            });
          } else {
            // light preset
            updateWorSettings({
              customColors: false,
              bgPreset: '__light__',
              bgColor: '#f3efe7',
              textColor: '#1c1c1c',
            });
          }
        }}
      />

      <WorSectionHeader
        theme={theme}
        label={getString('newMoon.settings.customColors')}
      />
      <WorSliderRow
        theme={theme}
        label={getString('newMoon.settings.brightness')}
        value={settings.brightness}
        min={0.5}
        max={1.6}
        step={0.05}
        formatValue={v => `${Math.round(v * 100)}%`}
        onValueChange={v => updateWorSettings({ brightness: v })}
      />

      <SwitchItem
        theme={theme}
        label={getString('newMoon.settings.progressBar')}
        value={settings.showProgressBar !== false}
        onPress={() =>
          updateWorSettings({ showProgressBar: settings.showProgressBar === false })
        }
      />
      {settings.showProgressBar !== false ? (
        <WorChipRow
          theme={theme}
          label={getString('newMoon.settings.progressBarColor')}
          options={[
            { value: '#00ffff', label: 'سماوي' },
            { value: '#f97316', label: 'برتقالي' },
            { value: '#4ade80', label: 'أخضر' },
            { value: '#ec4899', label: 'وردي' },
          ]}
          value={settings.progressBarColor}
          onSelect={v => updateWorSettings({ progressBarColor: v })}
        />
      ) : null}

      <ColorPickerModal
        visible={pickerModal.value}
        title={
          channel === 'bgColor'
            ? getString('newMoon.settings.bgColor')
            : channel === 'textColor'
            ? getString('newMoon.settings.textColor')
            : channel === 'accent'
            ? getString('newMoon.settings.accentColor')
            : getString('newMoon.settings.progressBarColor')
        }
        color={
          channel === 'bgColor'
            ? settings.bgColor
            : channel === 'textColor'
            ? settings.textColor
            : channel === 'accent'
            ? settings.accent
            : settings.progressBarColor
        }
        onSubmit={(value: string | undefined) => {
          if (value) {
            const bgChanged =
              channel === 'bgColor' &&
              isLightColor(value) !== isLightColor(settings.bgColor);
            updateWorSettings({
              [channel]: value,
              // Picking a background color is a custom theme; text stays
              // readable (auto-flip like the engine's theme cycle).
              ...(bgChanged
                ? {
                    customColors: true,
                    bgPreset: '__custom__',
                    textColor: isLightColor(value) ? '#1c1c1c' : '#ffffff',
                  }
                : channel === 'textColor' || channel === 'accent'
                ? { customColors: true, bgPreset: '__custom__' }
                : {}),
            });
          }
          pickerModal.setFalse();
        }}
        closeModal={pickerModal.setFalse}
        theme={theme}
      />
      <ColorRow
        theme={theme}
        label={getString('newMoon.settings.bgColor')}
        value={settings.bgColor}
        onPress={() => openPicker('bgColor')}
      />
      <ColorRow
        theme={theme}
        label={getString('newMoon.settings.textColor')}
        value={settings.textColor}
        onPress={() => openPicker('textColor')}
      />
      <ColorRow
        theme={theme}
        label={getString('newMoon.settings.accentColor')}
        value={settings.accent}
        onPress={() => openPicker('accent')}
      />
    </ScrollView>
  );
};

const ColorRow: React.FC<{
  label: string;
  value: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}> = ({ label, value, onPress, theme }) => (
  <Text onPress={onPress} accessibilityRole="button" style={[styles.colorRow, { color: theme.onSurface }]}>
    {label}
    <View style={[styles.colorDot, { backgroundColor: value }]} />
  </Text>
);

export default WorThemeTab;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 24 },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '600',
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.4)',
  },
});
