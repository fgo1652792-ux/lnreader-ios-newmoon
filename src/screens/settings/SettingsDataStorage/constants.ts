import type { ComponentProps } from 'react';
import MaterialIcon from '@react-native-vector-icons/material-design-icons';
import type { StorageCategoryId } from '@services/storage/types';
import type { StringMap } from '@i18n/types';

type StringKey = keyof StringMap;
type IconName = NonNullable<ComponentProps<typeof MaterialIcon>['name']>;

/** MDI icon per category — consistent with the sibling settings icons. */
export const CATEGORY_ICONS: Record<StorageCategoryId, IconName> = {
  downloads: 'download',
  images: 'image-multiple-outline',
  databases: 'database-outline',
  backups: 'archive-outline',
  crashLogs: 'bug-outline',
  temp: 'file-clock-outline',
  webview: 'web',
  documents: 'file-document-outline',
};

export const CATEGORY_TITLE_KEYS: Record<StorageCategoryId, StringKey> = {
  downloads: 'dataStorage.categories.downloads',
  images: 'dataStorage.categories.images',
  databases: 'dataStorage.categories.databases',
  backups: 'dataStorage.categories.backups',
  crashLogs: 'dataStorage.categories.crashLogs',
  temp: 'dataStorage.categories.temp',
  webview: 'dataStorage.categories.webview',
  documents: 'dataStorage.categories.documents',
};

export const CATEGORY_DESCRIPTION_KEYS: Record<StorageCategoryId, StringKey> = {
  downloads: 'dataStorage.categories.downloadsDesc',
  images: 'dataStorage.categories.imagesDesc',
  databases: 'dataStorage.categories.databasesDesc',
  backups: 'dataStorage.categories.backupsDesc',
  crashLogs: 'dataStorage.categories.crashLogsDesc',
  temp: 'dataStorage.categories.tempDesc',
  webview: 'dataStorage.categories.webviewDesc',
  documents: 'dataStorage.categories.documentsDesc',
};

/**
 * Explainer shown on the category detail screen before the user confirms —
 * an honest list of what the deletion touches.
 */
export const CATEGORY_WILL_DELETE_KEYS: Partial<
  Record<StorageCategoryId, StringKey>
> = {
  images: 'dataStorage.willDelete.images',
  temp: 'dataStorage.willDelete.temp',
  webview: 'dataStorage.willDelete.webview',
  crashLogs: 'dataStorage.willDelete.crashLogs',
  backups: 'dataStorage.willDelete.backups',
};
