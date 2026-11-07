// lnreader-ios/src/screens/reader/newmoon/worSettingsStore.ts
//
// External store over the New Moon reader settings (MMKV key
// @wor_reader_settings_v4 — the ONLY reader-settings store since the classic
// engine preview was retired from the settings screen).
//
// The settings screen tabs, the live preview WebView and the reader screen all
// read through this store, so a slider drag updates the preview without
// re-rendering the whole app (useSyncExternalStore — no React context churn).

import { useSyncExternalStore } from 'react';

import { DEFAULT_SETTINGS } from '../../../reader/newmoon/sections';
import {
  loadWorSettings,
  saveWorSettingsPatch,
  type WorReaderSettings,
} from './NewMoonAdapter';

let current: WorReaderSettings = loadWorSettings();

const listeners = new Set<() => void>();

export const getWorSettings = (): WorReaderSettings => current;

export const subscribeWorSettings = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Merge a patch into the live store + persist it (create-if-missing). */
export const updateWorSettings = (patch: Partial<WorReaderSettings>): void => {
  current = { ...current, ...patch };
  saveWorSettingsPatch(patch as Record<string, unknown>);
  listeners.forEach(l => l());
};

/** Restore the engine defaults (keeps nothing — Git is the rollback path). */
export const resetWorSettings = (): void => {
  current = { ...DEFAULT_SETTINGS };
  saveWorSettingsPatch(current as unknown as Record<string, unknown>);
  listeners.forEach(l => l());
};

/** React binding. Re-renders only when the WOR patch actually changes. */
export const useWorSettings = (): WorReaderSettings =>
  useSyncExternalStore(subscribeWorSettings, getWorSettings, getWorSettings);
