// src/hooks/useTranslatedMetadata.ts
//
// React binding for the translated-metadata layer (display-only — the
// original novel strings in SQLite/plugin data are never modified).
//
// useTranslatedMetadata(kind, text, pluginId?, novelPath?)
//   → the translated string as soon as it is available (memory hits apply
//     synchronously; misses are batched + debounced inside metadata.ts).
//   → undefined while untranslated; components fall back to the original.
//
// Scoping: titles/summaries/genres only queue when the automatic-translation
// metadata scope is on; chapter titles have their own independent toggle.
// The 'original' title mode disables title translation entirely (pure
// display preference, no requests).

import { useEffect, useSyncExternalStore } from 'react';

import {
  autoEnabled,
  loadPreferences,
  queueMetadata,
  subscribeMetadata,
  translatedMetadata,
  type MetadataItem,
  type MetadataKind,
  type MetadataTitleMode,
} from '@services/translation';

const subscribe = (onStoreChange: () => void): (() => void) =>
  subscribeMetadata(onStoreChange);

// Display preference (arabic | both | original). Sync MMKV read — settings
// changes re-render through the screen that hosts the picker.
export const useTitleMode = (): MetadataTitleMode =>
  loadPreferences().metadataTitleMode;

export const useChapterTitlesEnabled = (): boolean =>
  loadPreferences().chapterTitles === true;

// Scope gate per kind (plain read per render — no hook state needed).
const scopeEnabled = (kind: MetadataKind): boolean => {
  const prefs = loadPreferences();
  if (kind === 'chapterTitle') return prefs.chapterTitles === true;
  return autoEnabled('metadata', prefs);
};

export const useTranslatedMetadata = (
  kind: MetadataKind,
  text: string | undefined | null,
  pluginId = '',
  novelPath = '',
): string | undefined => {
  const scopedText = text?.trim();
  const enabled = scopedText ? scopeEnabled(kind) : false;
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (enabled ? translatedMetadata(scopedText!) ?? null : null),
    () => null,
  );

  useEffect(() => {
    if (!scopedText || !enabled) return;
    if (snapshot !== null) return; // already resolved this session
    const item: MetadataItem = { kind, pluginId, novelPath, text: scopedText };
    queueMetadata([item]);
  }, [kind, pluginId, novelPath, scopedText, snapshot, enabled]);

  return snapshot ?? undefined;
};
