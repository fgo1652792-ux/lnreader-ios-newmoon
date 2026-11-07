import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Appbar, List, SafeAreaView } from '@components';
import { Appbar as PaperAppbar } from 'react-native-paper';
import StorageBar from './components/StorageBar';
import {
  CATEGORY_DESCRIPTION_KEYS,
  CATEGORY_ICONS,
  CATEGORY_TITLE_KEYS,
} from './constants';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import type { DataStorageScreenProps } from '@navigators/types';
import {
  formatBytes,
  getDeviceStorageUsage,
  measureAppDataBytes,
  measureCategories,
} from '@services/storage/storageService';
import type {
  DeviceStorageUsage,
  StorageCategory,
  StorageCategoryId,
} from '@services/storage/types';
import MaterialIcon from '@react-native-vector-icons/material-design-icons';

const ORDER: StorageCategoryId[] = [
  'downloads',
  'images',
  'databases',
  'backups',
  'crashLogs',
  'temp',
  'webview',
  'documents',
];

const SettingsDataStorageScreen = ({ navigation }: DataStorageScreenProps) => {
  const theme = useTheme();

  const [device, setDevice] = useState<DeviceStorageUsage | null>(null);
  const [categories, setCategories] = useState<StorageCategory[] | null>(null);
  const [appDataBytes, setAppDataBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const measure = useCallback(async () => {
    try {
      const [deviceUsage, measuredCategories] = await Promise.all([
        getDeviceStorageUsage().catch(() => null),
        measureCategories(),
      ]);
      setDevice(deviceUsage);
      setCategories(measuredCategories);
      setAppDataBytes(measureAppDataBytes(measuredCategories));
    } catch (measureError) {
      setError(
        measureError instanceof Error
          ? measureError.message
          : String(measureError),
      );
    }
  }, []);

  useEffect(() => {
    measure();
  }, [measure]);

  const orderedCategories = useMemo(
    () =>
      (categories ?? []).sort(
        (a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id),
      ),
    [categories],
  );

  const openCategory = (categoryId: StorageCategoryId) => {
    if (categoryId === 'downloads') {
      navigation.navigate('SettingsStack', {
        screen: 'DataStorageDownloads',
      });
      return;
    }
    navigation.navigate('DataStorageCategory', { categoryId });
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('dataStorage.title')}
        handleGoBack={navigation.goBack}
        theme={theme}
      >
        <PaperAppbar.Action
          icon="refresh"
          onPress={measure}
          accessibilityLabel={getString('dataStorage.refresh')}
          color={theme.onSurface}
        />
      </Appbar>
      <ScrollView style={[styles.flex, { backgroundColor: theme.background }]}>
        {/* Device storage card — real volume numbers from the native module */}
        <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: theme.onSurface }]}>
              {getString('dataStorage.device.title')}
            </Text>
            {device ? (
              <Text
                style={[styles.sizeLabel, { color: theme.onSurfaceVariant }]}
              >
                {`${getString('dataStorage.device.free')} ${formatBytes(
                  device.free,
                )}`}
              </Text>
            ) : null}
          </View>
          {device ? (
            <>
              <StorageBar
                fraction={device.total > 0 ? device.used / device.total : 0}
                color={theme.primary}
                trackColor={theme.outlineVariant}
              />
              <View style={styles.deviceLegendRow}>
                <Text
                  style={[styles.legendText, { color: theme.onSurfaceVariant }]}
                >
                  {`${getString('dataStorage.device.used')}: ${formatBytes(
                    device.used,
                  )}`}
                </Text>
                <Text
                  style={[styles.legendText, { color: theme.onSurfaceVariant }]}
                >
                  {`${getString('dataStorage.device.total')}: ${formatBytes(
                    device.total,
                  )}`}
                </Text>
              </View>
            </>
          ) : (
            <View
              style={[
                styles.skeletonBar,
                { backgroundColor: theme.outlineVariant },
              ]}
            />
          )}
        </View>

        {/* App data card — real measured categories */}
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('dataStorage.appData.title')}
          </List.SubHeader>
          {error ? (
            <List.InfoItem
              title={`${getString(
                'dataStorage.appData.loadingError',
              )} — ${error}`}
              theme={theme}
            />
          ) : categories ? (
            <>
              {orderedCategories.map(category => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  appDataBytes={appDataBytes}
                  onPress={() => openCategory(category.id)}
                />
              ))}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: theme.onSurface }]}>
                  {getString('dataStorage.appData.total')}
                </Text>
                <Text style={[styles.totalValue, { color: theme.onSurface }]}>
                  {formatBytes(appDataBytes)}
                </Text>
              </View>
            </>
          ) : (
            <CategorySkeleton theme={theme} />
          )}
        </List.Section>

        {/* Personal data — explicitly non-deletable */}
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('dataStorage.personalData.title')}
          </List.SubHeader>
          <List.Item
            title={getString('dataStorage.personalData.library')}
            description={getString('dataStorage.personalData.irreversible')}
            icon="lock-outline"
            theme={theme}
            disabled
          />
          <List.Item
            title={getString('dataStorage.personalData.history')}
            description={getString('dataStorage.personalData.irreversible')}
            icon="lock-outline"
            theme={theme}
            disabled
          />
          <List.Item
            title={getString('dataStorage.personalData.settings')}
            description={getString('dataStorage.personalData.irreversible')}
            icon="lock-outline"
            theme={theme}
            disabled
          />
          <List.InfoItem
            title={getString('dataStorage.personalData.note')}
            theme={theme}
          />
        </List.Section>

        <List.InfoItem
          title={getString('dataStorage.footnote')}
          theme={theme}
          style={styles.footnote}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const CategoryRow: React.FC<{
  category: StorageCategory;
  appDataBytes: number;
  onPress: () => void;
}> = ({ category, appDataBytes, onPress }) => {
  const theme = useTheme();
  const fraction = appDataBytes > 0 ? category.bytes / appDataBytes : 0;
  return (
    <Pressable
      android_ripple={{ color: theme.rippleColor }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <MaterialIcon
          name={CATEGORY_ICONS[category.id]}
          size={22}
          color={theme.primary}
        />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTopLine}>
          <Text
            style={[styles.rowTitle, { color: theme.onSurface }]}
            numberOfLines={1}
          >
            {getString(CATEGORY_TITLE_KEYS[category.id])}
          </Text>
          <Text style={[styles.rowSize, { color: theme.onSurfaceVariant }]}>
            {formatBytes(category.bytes)}
          </Text>
        </View>
        <StorageBar
          fraction={fraction}
          color={category.deletable ? theme.primary : theme.tertiary}
          trackColor={theme.outlineVariant}
          height={4}
        />
        <Text
          style={[styles.rowDescription, { color: theme.onSurfaceVariant }]}
          numberOfLines={2}
        >
          {getString(CATEGORY_DESCRIPTION_KEYS[category.id])}
          {category.approximate
            ? ` · ${getString('dataStorage.categoryScreen.approximate')}`
            : ''}
        </Text>
      </View>
    </Pressable>
  );
};

const CategorySkeleton = ({
  theme,
}: {
  theme: ReturnType<typeof useTheme>;
}) => (
  <View style={styles.skeletonColumn}>
    {[0, 1, 2].map(index => (
      <View key={index} style={styles.skeletonRow}>
        <View
          style={[
            styles.skeletonIcon,
            { backgroundColor: theme.outlineVariant },
          ]}
        />
        <View style={styles.skeletonLines}>
          <View
            style={[
              styles.skeletonLine,
              { backgroundColor: theme.outlineVariant },
            ]}
          />
          <View
            style={[
              styles.skeletonLineShort,
              { backgroundColor: theme.outlineVariant },
            ]}
          />
        </View>
      </View>
    ))}
  </View>
);

export default SettingsDataStorageScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderRadius: 16,
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
  },
  cardHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sizeLabel: {
    fontSize: 13,
  },
  deviceLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendText: {
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    paddingEnd: 16,
    paddingTop: 2,
  },
  rowContent: {
    flex: 1,
    gap: 6,
  },
  rowTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowTitle: {
    flexShrink: 1,
    fontSize: 15,
  },
  rowSize: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  rowDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  footnote: {
    marginBottom: 32,
  },
  skeletonColumn: {
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skeletonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  skeletonIcon: {
    borderRadius: 20,
    height: 40,
    width: 40,
  },
  skeletonLines: {
    flex: 1,
    gap: 8,
  },
  skeletonLine: {
    height: 14,
    width: '70%',
  },
  skeletonLineShort: {
    height: 12,
    width: '40%',
  },
  skeletonBar: {
    borderRadius: 3,
    height: 6,
    width: '100%',
  },
});
