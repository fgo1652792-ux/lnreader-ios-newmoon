import type { StorageCategoryId } from './types';

/**
 * Categories that may be wiped through deleteCategory(). Everything else —
 * downloads (per-novel APIs only), documents, and especially databases — is
 * deliberately excluded: personal data is never bulk-deletable from this
 * screen.
 */
export const REBUILDABLE_CATEGORY_IDS: StorageCategoryId[] = [
  'images',
  'temp',
  'webview',
  'crashLogs',
  'backups',
];

export const isRebuildableCategory = (
  categoryId: string,
): categoryId is StorageCategoryId =>
  (REBUILDABLE_CATEGORY_IDS as string[]).includes(categoryId);
