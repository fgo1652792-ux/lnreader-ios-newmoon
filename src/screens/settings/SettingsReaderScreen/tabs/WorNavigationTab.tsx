// lnreader-ios/src/screens/settings/SettingsReaderScreen/tabs/WorNavigationTab.tsx
//
// New Moon navigation/behavior settings. The classic engine's volume-button
// paging controls are intentionally ABSENT — New Moon is the only engine and
// dead controls for it would be misleading (per the P0 settings-unification
// decision).

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SwitchItem, Button } from '@components/index';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';

import {
  useWorSettings,
  updateWorSettings,
  resetWorSettings,
} from '../../../reader/newmoon/worSettingsStore';

const WorNavigationTab: React.FC = () => {
  const theme = useTheme();
  const settings = useWorSettings();

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <SwitchItem
        theme={theme}
        label={getString('newMoon.settings.continuousMode')}
        description={getString('newMoon.settings.continuousModeDesc')}
        value={!!settings.continuousMode}
        onPress={() => updateWorSettings({ continuousMode: !settings.continuousMode })}
      />
      <SwitchItem
        theme={theme}
        label={getString('newMoon.settings.tapToToggle')}
        value={settings.tapToToggle !== false}
        onPress={() => updateWorSettings({ tapToToggle: settings.tapToToggle === false })}
      />
      <SwitchItem
        theme={theme}
        label={getString('newMoon.settings.showDock')}
        value={settings.dockOpen !== false}
        onPress={() => updateWorSettings({ dockOpen: settings.dockOpen === false })}
      />
      <SwitchItem
        theme={theme}
        label={getString('newMoon.settings.hideTitle')}
        value={!!settings.hideTitle}
        onPress={() => updateWorSettings({ hideTitle: !settings.hideTitle })}
      />
      <SwitchItem
        theme={theme}
        label={getString('newMoon.settings.keepAwake')}
        value={!!settings.keepAwake}
        onPress={() => updateWorSettings({ keepAwake: !settings.keepAwake })}
      />
      <SwitchItem
        theme={theme}
        label={getString('newMoon.settings.autoScroll')}
        value={!!settings.autoScroll}
        onPress={() => updateWorSettings({ autoScroll: !settings.autoScroll })}
      />

      <View style={styles.resetContainer}>
        <Text style={[styles.resetHint, { color: theme.onSurfaceVariant }]}>
          {getString('newMoon.settings.resetHint')}
        </Text>
        <Button
          onPress={resetWorSettings}
          title={getString('newMoon.settings.reset')}
        />
      </View>
    </ScrollView>
  );
};

export default WorNavigationTab;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 24 },
  resetContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  resetHint: {
    fontSize: 13,
    lineHeight: 19,
  },
});
