// lnreader-ios/src/screens/settings/SettingsReaderScreen/SettingsReaderScreen.tsx
//
// Reader settings — NEW MOON ONLY.
//
// Decision (P0 settings-unification): New Moon is the only visible reader
// engine. The classic LNReader preview (SettingsReaderWebView) and the
// engine switcher are removed; the tabs below edit the New Moon store
// (@wor_reader_settings_v4) directly, and the preview is the REAL worShell
// engine running in a WebView (WorPreview) — what you see is what you read.
//
// One-time migration: legacy CHAPTER_READER_SETTINGS values are migrated into
// the New Moon store with per-value type checks (settingsMigration.ts).

import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { useNavigation } from '@react-navigation/native';
import { FAB } from 'react-native-paper';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import {
  TabView,
  type TabBarProps,
  type TabDescriptor,
} from 'react-native-tab-view';

import { Appbar, SafeAreaView, TopTabBar } from '@components/index';
import BottomSheet from '@components/BottomSheet/BottomSheet';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { showToast } from '@utils/showToast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import WorPreview from './components/WorPreview';
import WorDisplayTab from './tabs/WorDisplayTab';
import WorThemeTab from './tabs/WorThemeTab';
import WorNavigationTab from './tabs/WorNavigationTab';
import WorAccessibilityTab from './tabs/WorAccessibilityTab';
import { migrateLegacyReaderSettingsOnce } from '../../reader/newmoon/settingsMigration';

type ReaderSettingsRoute = {
  key: 'display' | 'theme' | 'navigation' | 'accessibility';
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

const routes: ReaderSettingsRoute[] = [
  {
    key: 'display',
    title: getString('readerSettings.tabDisplay'),
    icon: 'format-size',
  },
  {
    key: 'theme',
    title: getString('readerSettings.tabTheme'),
    icon: 'palette-outline',
  },
  {
    key: 'navigation',
    title: getString('readerSettings.tabNavigation'),
    icon: 'gesture-swipe-horizontal',
  },
  {
    key: 'accessibility',
    title: getString('readerSettings.tabAccessibility'),
    icon: 'account-voice',
  },
];

const tabOptions: TabDescriptor<ReaderSettingsRoute> = {
  icon: ({ route, color: iconColor }) => (
    <MaterialCommunityIcons
      accessibilityLabel={route.title}
      name={route.icon}
      size={20}
      color={iconColor}
    />
  ),
  label: () => null,
};

const SettingsReaderScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const bottomSheetRef = useRef<BottomSheetModalMethods>(null);
  const { bottom, right } = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const [tabIndex, setTabIndex] = useState(0);
  const migrationRanRef = useRef(false);

  // One-time legacy → New Moon settings migration (type-checked, best-effort).
  useEffect(() => {
    if (migrationRanRef.current) {
      return;
    }
    migrationRanRef.current = true;
    if (migrateLegacyReaderSettingsOnce()) {
      showToast(getString('newMoon.settings.migrated'));
    }
  }, []);

  const openBottomSheet = () => {
    bottomSheetRef.current?.present();
  };

  const renderTabContent = useCallback(
    ({ route }: { route: ReaderSettingsRoute }) => {
      switch (route.key) {
        case 'display':
          return <WorDisplayTab />;
        case 'theme':
          return <WorThemeTab />;
        case 'navigation':
          return <WorNavigationTab />;
        case 'accessibility':
          return <WorAccessibilityTab />;
        default:
          return <WorDisplayTab />;
      }
    },
    [],
  );

  const renderTabBar = useCallback(
    (props: TabBarProps<ReaderSettingsRoute>) => (
      <TopTabBar
        {...props}
        style={[
          styles.tabBar,
          {
            backgroundColor: theme.surfaceContainerLow ?? theme.surface,
            borderBottomColor: theme.outlineVariant,
          },
        ]}
        indicatorStyle={{ backgroundColor: theme.primary }}
        activeColor={theme.primary}
        inactiveColor={theme.onSurfaceVariant}
        android_ripple={{ color: theme.rippleColor, borderless: false }}
      />
    ),
    [
      theme.outlineVariant,
      theme.onSurfaceVariant,
      theme.primary,
      theme.rippleColor,
      theme.surface,
      theme.surfaceContainerLow,
    ],
  );

  return (
    <SafeAreaView excludeTop style={styles.container}>
      <Appbar
        mode="small"
        title={getString('readerSettings.title')}
        handleGoBack={navigation.goBack}
        theme={theme}
      />

      {/* Real New Moon engine preview — the worShell itself, live-bound to
          the same settings store the reader uses. */}
      <View style={styles.previewContainer}>
        <WorPreview />
      </View>

      {/* Floating Action Button to Open Bottom Sheet */}
      <FAB
        style={[
          styles.fab,
          {
            backgroundColor: theme.primary,
            bottom,
            right,
          },
        ]}
        icon="cog"
        color={theme.onPrimary}
        onPress={openBottomSheet}
      />

      {/* Bottom Sheet with Tabs */}
      <BottomSheet
        bottomSheetRef={bottomSheetRef}
        snapPoints={[BOTTOM_SHEET_HEIGHT(screenHeight)]}
      >
        <View style={styles.bottomSheetContent}>
          <TabView
            commonOptions={tabOptions}
            navigationState={{ index: tabIndex, routes }}
            renderTabBar={renderTabBar}
            renderScene={renderTabContent}
            onIndexChange={setTabIndex}
            initialLayout={{ width: screenWidth }}
            lazy
            lazyPreloadDistance={0}
            swipeEnabled={false}
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
};

const BOTTOM_SHEET_HEIGHT = (screenHeight: number) => screenHeight * 0.7;

export default SettingsReaderScreen;

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    margin: 16,
  },
  bottomSheetContent: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  previewContainer: {
    flex: 1,
  },
  tabBar: {
    borderBottomWidth: 1,
    elevation: 0,
  },
});
