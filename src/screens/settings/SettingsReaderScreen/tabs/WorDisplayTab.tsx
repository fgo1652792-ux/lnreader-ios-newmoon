// lnreader-ios/src/screens/settings/SettingsReaderScreen/tabs/WorDisplayTab.tsx
//
// New Moon typography settings (the ONLY display tab since the classic reader
// preview was retired). Binds to the wor settings store — changes reach the
// live preview and the reader instantly, with no WebView reloads.

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';

import { WOR_FONTS } from '../../../../reader/newmoon/worFonts';
import { useWorSettings, updateWorSettings } from '../../../reader/newmoon/worSettingsStore';
import { WorChipRow, WorSectionHeader, WorSliderRow } from '../WorControls';

const WEIGHTS = [
  { value: '300', label: 'خفيف' },
  { value: '400', label: 'عادي' },
  { value: '700', label: 'عريض' },
  { value: '900', label: 'ثقيل' },
];

const WorDisplayTab: React.FC = () => {
  const theme = useTheme();
  const settings = useWorSettings();

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <WorSectionHeader
        theme={theme}
        label={getString('newMoon.settings.fontSize')}
      />
      <WorSliderRow
        theme={theme}
        label={getString('newMoon.settings.fontSize')}
        value={settings.fontSize}
        min={12}
        max={32}
        step={1}
        formatValue={v => `${v}px`}
        onValueChange={v => updateWorSettings({ fontSize: v })}
      />
      <WorSliderRow
        theme={theme}
        label={getString('newMoon.settings.lineHeight')}
        value={settings.lineHeight}
        min={1}
        max={3.5}
        step={0.05}
        formatValue={v => v.toFixed(2)}
        onValueChange={v => updateWorSettings({ lineHeight: v })}
      />
      <WorSliderRow
        theme={theme}
        label={getString('newMoon.settings.wordSpacing')}
        value={settings.wordSpacing}
        min={0}
        max={10}
        step={0.5}
        formatValue={v => `${v}px`}
        onValueChange={v => updateWorSettings({ wordSpacing: v })}
      />

      <WorSectionHeader
        theme={theme}
        label={getString('newMoon.settings.fontWeight')}
      />
      <WorChipRow
        theme={theme}
        options={WEIGHTS}
        value={String(settings.fontWeight)}
        onSelect={v => updateWorSettings({ fontWeight: v })}
      />

      <WorSectionHeader
        theme={theme}
        label={getString('newMoon.settings.fontFamily')}
      />
      <WorChipRow
        theme={theme}
        options={WOR_FONTS.map(f => ({ value: f.value, label: f.name }))}
        value={settings.fontValue}
        onSelect={v => updateWorSettings({ fontValue: v })}
      />

      <WorSectionHeader
        theme={theme}
        label={getString('newMoon.settings.direction')}
      />
      <WorChipRow
        theme={theme}
        options={[
          { value: 'rtl', label: getString('newMoon.settings.directionRtl') },
          { value: 'ltr', label: getString('newMoon.settings.directionLtr') },
          { value: 'center', label: getString('newMoon.settings.directionCenter') },
        ]}
        value={settings.direction}
        onSelect={v => updateWorSettings({ direction: v })}
      />
      <View style={styles.footerSpace} />
    </ScrollView>
  );
};

export default WorDisplayTab;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 24 },
  footerSpace: { height: 8 },
});
