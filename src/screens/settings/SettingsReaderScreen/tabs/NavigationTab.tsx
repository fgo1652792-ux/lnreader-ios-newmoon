// lnreader-ios/src/screens/settings/SettingsReaderScreen/tabs/NavigationTab.tsx
//
// Navigation/behavior settings for the New Moon (WOR) engine. Every switch
// writes the @wor_reader_settings_v4 shape via useWorSettings. The classic
// engine's page-reader/volume-button controls lived on
// CHAPTER_GENERAL_SETTINGS and only affected the old WebView reader — they are
// gone now that New Moon is the only visible engine.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { List } from '@components/index';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';

import { type WorSettingsTabProps } from '../useWorSettings';
import SettingSwitch from '../../components/SettingSwitch';

const NavigationTab: React.FC<WorSettingsTabProps> = ({
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
          {getString('newMoon.settingsReadingBehavior')}
        </List.SubHeader>
        <SettingSwitch
          label={getString('newMoon.settingsContinuousMode')}
          description={getString('newMoon.settingsContinuousModeDescription')}
          value={settings.continuousMode === true}
          onPress={() => patch({ continuousMode: !settings.continuousMode })}
          theme={theme}
        />
        <SettingSwitch
          label={getString('newMoon.settingsAutoScroll')}
          description={getString('newMoon.settingsAutoScrollDescription')}
          value={settings.autoScroll === true}
          onPress={() => patch({ autoScroll: !settings.autoScroll })}
          theme={theme}
        />
        <SettingSwitch
          label={getString('newMoon.settingsKeepAwake')}
          description={getString('newMoon.settingsKeepAwakeDescription')}
          value={settings.keepAwake === true}
          onPress={() => patch({ keepAwake: !settings.keepAwake })}
          theme={theme}
        />
        <SettingSwitch
          label={getString('newMoon.settingsTapToToggle')}
          description={getString('newMoon.settingsTapToToggleDescription')}
          value={settings.tapToToggle === true}
          onPress={() => patch({ tapToToggle: !settings.tapToToggle })}
          theme={theme}
        />
      </View>

      <View style={styles.section}>
        <List.SubHeader theme={theme}>
          {getString('newMoon.settingsReaderChrome')}
        </List.SubHeader>
        <SettingSwitch
          label={getString('newMoon.settingsDockOpen')}
          description={getString('newMoon.settingsDockOpenDescription')}
          value={settings.dockOpen === true}
          onPress={() => patch({ dockOpen: !settings.dockOpen })}
          theme={theme}
        />
        <SettingSwitch
          label={getString('newMoon.settingsHideTitle')}
          description={getString('newMoon.settingsHideTitleDescription')}
          value={settings.hideTitle === true}
          onPress={() => patch({ hideTitle: !settings.hideTitle })}
          theme={theme}
        />
        <SettingSwitch
          label={getString('newMoon.settingsShowProgressBar')}
          value={settings.showProgressBar === true}
          onPress={() => patch({ showProgressBar: !settings.showProgressBar })}
          theme={theme}
        />
      </View>

      <View style={styles.section}>
        <List.SubHeader theme={theme}>
          {getString('newMoon.settingsSeparator')}
        </List.SubHeader>
        <SettingSwitch
          label={getString('newMoon.settingsSeparator')}
          value={settings.enableSeparator === true}
          onPress={() => patch({ enableSeparator: !settings.enableSeparator })}
          theme={theme}
        />
      </View>

      <View style={styles.bottomSpacing} />
    </BottomSheetScrollView>
  );
};

export default NavigationTab;

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
  bottomSpacing: {
    height: 24,
  },
});
