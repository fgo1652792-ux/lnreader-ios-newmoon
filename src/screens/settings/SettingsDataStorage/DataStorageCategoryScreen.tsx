import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Appbar,
  Button,
  ConfirmationDialog,
  List,
  SafeAreaView,
} from '@components';
import { CATEGORY_TITLE_KEYS, CATEGORY_WILL_DELETE_KEYS } from './constants';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import type { DataStorageCategoryScreenProps } from '@navigators/types';
import {
  deleteCategory,
  formatBytes,
  measureCategories,
  measureStats,
} from '@services/storage/storageService';
import { isRebuildableCategory } from '@services/storage/categories';
import type {
  DeletionResult,
  DirectoryStats,
  StorageCategoryId,
} from '@services/storage/types';
import {
  DATABASE_DIR,
  DOCUMENTS_DIR,
  NOVEL_STORAGE_DIR,
} from '@services/storage/storagePaths';

/**
 * Re-measures the category's real paths. Kept local (instead of a full
 * measureCategories()) so the screen can also refresh a single category
 * cheaply right after a deletion.
 */
const measureOne = async (
  categoryId: StorageCategoryId,
): Promise<DirectoryStats> => {
  switch (categoryId) {
    case 'downloads':
      return measureStats(NOVEL_STORAGE_DIR);
    case 'documents':
      return measureStats(DOCUMENTS_DIR);
    case 'databases':
      return measureStats(DATABASE_DIR);
    default: {
      // Rebuildable categories re-measure through the shared service —
      // keeps the path classification in one place.
      const categories = await measureCategories();
      const found = categories.find(category => category.id === categoryId);
      return {
        size: found?.bytes ?? 0,
        files: found?.files ?? 0,
        folders: found?.folders ?? 0,
        skipped: found?.skipped ?? 0,
      };
    }
  }
};

const DataStorageCategoryScreen = ({
  navigation,
  route,
}: DataStorageCategoryScreenProps) => {
  const { categoryId } = route.params;
  const theme = useTheme();

  const [stats, setStats] = useState<DirectoryStats | null>(null);
  const [lastResult, setLastResult] = useState<DeletionResult | null>(null);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [cookieWarningVisible, setCookieWarningVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const rebuildable = isRebuildableCategory(categoryId);

  const measure = useCallback(async () => {
    try {
      setStats(await measureOne(categoryId));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [categoryId]);

  useEffect(() => {
    measure();
  }, [measure]);

  if (!rebuildable) {
    return (
      <SafeAreaView excludeTop>
        <Appbar
          title={getString('dataStorage.title')}
          handleGoBack={navigation.goBack}
          theme={theme}
        />
        <List.InfoItem
          title={getString('dataStorage.errors.categoryNotDeletable')}
          theme={theme}
        />
      </SafeAreaView>
    );
  }

  const performDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteCategory(categoryId);
      setLastResult(result);
      await measure();
    } catch (error) {
      setLastResult({
        freedBytes: 0,
        deletedCount: 0,
        verified: false,
        errors: [error instanceof Error ? error.message : String(error)],
      });
    } finally {
      setIsDeleting(false);
      setCookieWarningVisible(false);
      setDeleteDialogVisible(false);
    }
  };

  const onRequestDelete = () => {
    setDeleteDialogVisible(true);
  };

  const title = getString(CATEGORY_TITLE_KEYS[categoryId]);
  const willDeleteKey = CATEGORY_WILL_DELETE_KEYS[categoryId];

  return (
    <SafeAreaView excludeTop>
      <Appbar title={title} handleGoBack={navigation.goBack} theme={theme} />
      <ScrollView
        style={[styles.flex, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
      >
        <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.sizeTitle, { color: theme.onSurface }]}>
              {getString('dataStorage.categoryScreen.currentSize')}
            </Text>
            <Text style={[styles.sizeValue, { color: theme.onSurface }]}>
              {stats ? formatBytes(stats.size) : '…'}
            </Text>
          </View>
          {stats ? (
            <Text style={[styles.sizeMeta, { color: theme.onSurfaceVariant }]}>
              {getString('dataStorage.categoryScreen.filesCount', {
                count: stats.files,
              })}
            </Text>
          ) : null}
          {loadError ? (
            <Text style={[styles.errorText, { color: theme.error }]}>
              {loadError}
            </Text>
          ) : null}
          {lastResult ? (
            <View
              style={[
                styles.resultBox,
                {
                  backgroundColor: lastResult.verified
                    ? theme.primaryContainer
                    : theme.errorContainer,
                },
              ]}
            >
              <Text
                style={[
                  styles.resultText,
                  {
                    color: lastResult.verified
                      ? theme.onPrimaryContainer
                      : theme.onErrorContainer,
                  },
                ]}
              >
                {getString('dataStorage.categoryScreen.freed', {
                  size: formatBytes(lastResult.freedBytes),
                })}
                {` · ${getString('dataStorage.categoryScreen.newSize', {
                  size: formatBytes(stats?.size ?? 0),
                })}`}
              </Text>
              <Text
                style={[
                  styles.resultMeta,
                  {
                    color: lastResult.verified
                      ? theme.onPrimaryContainer
                      : theme.onErrorContainer,
                  },
                ]}
              >
                {lastResult.verified
                  ? getString('dataStorage.categoryScreen.verified')
                  : getString('dataStorage.categoryScreen.unverified')}
              </Text>
              {lastResult.errors.length ? (
                <>
                  <Text
                    style={[
                      styles.resultMeta,
                      { color: theme.onErrorContainer },
                    ]}
                  >
                    {getString('dataStorage.categoryScreen.failed')}
                  </Text>
                  {lastResult.errors.map((message, index) => (
                    <Text key={`${index}-${message}`} style={styles.errorText}>
                      {message}
                    </Text>
                  ))}
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('dataStorage.categoryScreen.willDelete')}
          </List.SubHeader>
          <List.InfoItem
            title={
              willDeleteKey
                ? getString(willDeleteKey)
                : getString('dataStorage.confirm.deleteCategoryMessage')
            }
            theme={theme}
          />
          {categoryId === 'webview' ? (
            <List.InfoItem
              title={getString('dataStorage.webviewWarning.message')}
              theme={theme}
            />
          ) : null}
        </List.Section>

        <Button
          mode="contained-tonal"
          onPress={onRequestDelete}
          textColor={theme.onErrorContainer}
          style={styles.deleteButton}
          buttonColor={theme.errorContainer}
          loading={isDeleting}
          disabled={isDeleting}
          icon="delete-outline"
        >
          {getString('dataStorage.categoryScreen.delete')}
        </Button>
      </ScrollView>

      <ConfirmationDialog
        visible={deleteDialogVisible}
        title={getString('dataStorage.categoryScreen.deleteConfirmTitle', {
          category: title,
        })}
        message={getString('dataStorage.confirm.deleteCategoryMessage')}
        confirmLabel={getString('dataStorage.categoryScreen.delete')}
        onDismiss={() => setDeleteDialogVisible(false)}
        onConfirm={() => {
          setDeleteDialogVisible(false);
          // Distinct, separate cookie/login warning — shown only after the
          // user has already confirmed the deletion itself.
          if (categoryId === 'webview') {
            setCookieWarningVisible(true);
            return;
          }
          return performDelete();
        }}
      />

      <ConfirmationDialog
        visible={cookieWarningVisible}
        title={getString('dataStorage.webviewWarning.title')}
        message={getString('dataStorage.webviewWarning.message')}
        confirmLabel={getString('dataStorage.webviewWarning.confirm')}
        confirmFirst
        onConfirm={performDelete}
        onDismiss={() => setCookieWarningVisible(false)}
      />
    </SafeAreaView>
  );
};

export default DataStorageCategoryScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
  },
  cardHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sizeTitle: {
    fontSize: 15,
  },
  sizeValue: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  sizeMeta: {
    fontSize: 12,
  },
  resultBox: {
    borderRadius: 12,
    gap: 4,
    padding: 12,
  },
  resultText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultMeta: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
  },
  deleteButton: {
    marginHorizontal: 16,
    marginTop: 16,
  },
});
