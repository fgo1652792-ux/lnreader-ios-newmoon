import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Appbar,
  ConfirmationDialog,
  Dialog,
  EmptyView,
  SafeAreaView,
} from '@components';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import type { DataStorageDownloadsScreenProps } from '@navigators/types';
import {
  deleteAllChaptersOfNovel,
  formatBytes,
  measureNovelDownloads,
} from '@services/storage/storageService';
import type { NovelStorageUsage } from '@services/storage/types';
import { showToast } from '@utils/showToast';
import MaterialIcon from '@react-native-vector-icons/material-design-icons';

const DataStorageDownloadsScreen = ({
  navigation,
}: DataStorageDownloadsScreenProps) => {
  const theme = useTheme();

  const [usage, setUsage] = useState<NovelStorageUsage[] | null>(null);
  const [pendingNovel, setPendingNovel] = useState<NovelStorageUsage | null>(
    null,
  );
  const [failedErrors, setFailedErrors] = useState<string[] | null>(null);

  const measure = useCallback(async () => {
    try {
      setUsage(await measureNovelDownloads());
    } catch (error) {
      setUsage([]);
      setFailedErrors([error instanceof Error ? error.message : String(error)]);
    }
  }, []);

  useEffect(() => {
    measure();
  }, [measure]);

  const confirmDelete = async () => {
    if (!pendingNovel) {
      return;
    }
    try {
      const result = await deleteAllChaptersOfNovel(pendingNovel.novelId);
      if (result.errors.length) {
        setFailedErrors(result.errors);
      } else {
        showToast(
          getString('dataStorage.downloadsScreen.freedToast', {
            size: formatBytes(result.freedBytes),
            novel: pendingNovel.name,
          }),
        );
      }
      await measure();
    } catch (error) {
      setFailedErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setPendingNovel(null);
    }
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('dataStorage.downloadsScreen.title')}
        handleGoBack={navigation.goBack}
        theme={theme}
      />
      <ScrollView
        style={[styles.flex, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
      >
        {usage && usage.length === 0 ? (
          <EmptyView
            icon="download-off-outline"
            description={getString('dataStorage.downloadsScreen.emptyDesc')}
            theme={theme}
          />
        ) : null}
        {(usage ?? []).map(novelUsage => (
          <View
            key={novelUsage.novelId}
            style={[styles.row, { backgroundColor: theme.surfaceVariant }]}
          >
            <View style={styles.rowContent}>
              <Text
                style={[styles.rowTitle, { color: theme.onSurface }]}
                numberOfLines={1}
              >
                {novelUsage.name}
              </Text>
              <Text style={[styles.rowMeta, { color: theme.onSurfaceVariant }]}>
                {getString('dataStorage.downloadsScreen.chaptersCount', {
                  count: novelUsage.chapters,
                })}
                {` · ${formatBytes(novelUsage.bytes)}`}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={getString(
                'dataStorage.downloadsScreen.deleteAction',
              )}
              android_ripple={{ color: theme.rippleColor }}
              onPress={() => setPendingNovel(novelUsage)}
              style={[
                styles.deleteButton,
                { backgroundColor: theme.errorContainer },
              ]}
            >
              <MaterialIcon
                name="delete-outline"
                size={20}
                color={theme.onErrorContainer}
              />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <ConfirmationDialog
        visible={!!pendingNovel}
        title={getString('dataStorage.confirm.deleteChaptersTitle')}
        message={getString('dataStorage.confirm.deleteChaptersMessage')}
        confirmLabel={getString('dataStorage.downloadsScreen.deleteAction')}
        onConfirm={confirmDelete}
        onDismiss={() => setPendingNovel(null)}
      />

      <Dialog.Root
        visible={failedErrors !== null}
        onDismiss={() => setFailedErrors(null)}
      >
        <Dialog.Header>
          <Dialog.Title>
            {getString('dataStorage.categoryScreen.failed')}
          </Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          {(failedErrors ?? []).map((message, index) => (
            <Text
              key={`${index}-${message}`}
              style={[styles.errorText, { color: theme.error }]}
            >
              {message}
            </Text>
          ))}
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setFailedErrors(null)}>
            {getString('common.ok')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>
    </SafeAreaView>
  );
};

export default DataStorageDownloadsScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingBottom: 40,
  },
  row: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: 8,
    marginHorizontal: 16,
    paddingEnd: 8,
    paddingStart: 16,
    paddingVertical: 12,
  },
  rowContent: {
    flex: 1,
    gap: 4,
    paddingEnd: 8,
  },
  rowTitle: {
    fontSize: 15,
  },
  rowMeta: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  deleteButton: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
});
