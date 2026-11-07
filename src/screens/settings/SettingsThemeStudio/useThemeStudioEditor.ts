import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useMMKVBoolean,
  useMMKVNumber,
  useMMKVString,
} from 'react-native-mmkv';
import type { Material3Theme } from '@pchmn/expo-material3-theme';

import { buildThemeColors } from '@hooks/persisted/useTheme';
import { getSystemDynamicTheme, isDynamicThemeAvailable } from '@theme/dynamic';
import {
  resolveStudioBundle,
  themeOverridesEqual,
} from '@theme/studio/overrides';
import { THEME_PRESETS } from '@theme/studio/presets';
import {
  THEME_STUDIO_ACTIVE_KEY,
  THEME_STUDIO_THEMES_KEY,
  useThemeStudioStorage,
} from '@theme/studio/storage';
import type {
  ThemeColorToken,
  ThemeOverrides,
  TokenOverrides,
} from '@theme/studio/tokens';
import type { ThemeColors } from '@theme/types';
import { normalizeHex } from '@theme/studio/color';
import { getString } from '@i18n/translations';
import type { StringMap } from '@i18n/types';

export type StudioMode = 'light' | 'dark';

/** Debounce window for auto-commits into the active user theme. */
const COMMIT_DEBOUNCE_MS = 250;

const EMPTY_DRAFTS: ThemeOverrides = {};

const presetNames = (): Record<string, string> =>
  Object.fromEntries(
    THEME_PRESETS.map(preset => [
      preset.id,
      getString(`themeStudio.presets.${preset.key}` as keyof StringMap),
    ]),
  );

/**
 * Editor state machine for Theme Studio.
 *
 * Performance contract: token edits land in LOCAL draft state first. The
 * picker drag never touches MMKV — commits to the active user theme happen
 * debounced (250 ms) after apply, and switching presets/themes is the only
 * operation that immediately re-renders the whole app theme.
 */
export const useThemeStudioEditor = () => {
  const storage = useThemeStudioStorage();
  const { userThemes } = storage;

  const [themeId] = useMMKVNumber('APP_THEME_ID');
  const [appThemeMode = 'system'] = useMMKVString('THEME_MODE');
  const [isAmoledBlack = false] = useMMKVBoolean('AMOLED_BLACK');
  const [customAccent] = useMMKVString('CUSTOM_ACCENT_COLOR');
  const [activeId] = useMMKVString(THEME_STUDIO_ACTIVE_KEY);
  const [rawThemes] = useMMKVString(THEME_STUDIO_THEMES_KEY);

  const [mode, setMode] = useState<StudioMode>('light');
  const [drafts, setDrafts] = useState<ThemeOverrides>(EMPTY_DRAFTS);

  /** Latest drafts for debounced/event-driven commits (kept out of render). */
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const dynamicTheme = useMemo<Material3Theme>(
    () =>
      isDynamicThemeAvailable
        ? getSystemDynamicTheme()
        : ({ light: {}, dark: {} } as Material3Theme),
    [],
  );

  /** The bundle currently applied by useTheme (preset or user theme). */
  const activeBundle = useMemo(
    () => resolveStudioBundle(activeId, rawThemes),
    [activeId, rawThemes],
  );

  const targetKind: 'none' | 'preset' | 'user' = !activeId
    ? 'none'
    : activeId.startsWith('user:')
    ? 'user'
    : 'preset';

  const targetUserTheme = useMemo(
    () => userThemes.find(t => t.id === activeId),
    [activeId, userThemes],
  );

  const targetName = useMemo(() => {
    if (targetKind === 'user') {
      return targetUserTheme?.name ?? getString('themeStudio.presets.off');
    }
    if (targetKind === 'preset' && activeId) {
      return presetNames()[activeId] ?? getString('themeStudio.presets.off');
    }
    return getString('themeStudio.presets.off');
  }, [activeId, targetKind, targetUserTheme]);

  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCommitTimer = useCallback(() => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
  }, []);

  useEffect(() => clearCommitTimer, [clearCommitTimer]);

  // Switching the editing target resets local edits (they are persisted in
  // the target or intentionally discarded) and cancels pending commits so a
  // stale draft can never land in the new target.
  useEffect(() => {
    clearCommitTimer();
    setDrafts(EMPTY_DRAFTS);
  }, [activeId, clearCommitTimer]);

  const buildInput = useMemo(
    () => ({
      themeMode: appThemeMode,
      themeId,
      dynamicTheme,
      isAmoledBlack,
      customAccent,
    }),
    [appThemeMode, themeId, dynamicTheme, isAmoledBlack, customAccent],
  );

  /** Stock scheme colors (no studio overrides) per mode — the "default". */
  const stock = useMemo(
    () => ({
      light: buildThemeColors(buildInput, false, undefined),
      dark: buildThemeColors(buildInput, true, undefined),
    }),
    [buildInput],
  );

  /** What useTheme currently renders per mode (target + no local edits). */
  const applied = useMemo(
    () => ({
      light: buildThemeColors(buildInput, false, activeBundle),
      dark: buildThemeColors(buildInput, true, activeBundle),
    }),
    [buildInput, activeBundle],
  );

  /** Effective colors for the edited mode: target + local drafts. */
  const effectiveColors = useMemo<ThemeColors>(
    () =>
      buildThemeColors(buildInput, mode === 'dark', {
        [mode]: drafts[mode],
      }),
    [buildInput, drafts, mode],
  );

  const effectiveToken = useCallback(
    (token: ThemeColorToken): string =>
      drafts[mode]?.[token] ?? applied[mode][token] ?? '',
    [applied, drafts, mode],
  );

  const stockToken = useCallback(
    (token: ThemeColorToken): string => stock[mode][token] ?? '',
    [mode, stock],
  );

  /** True when the effective color differs from the stock MD3 scheme. */
  const isOverridden = useCallback(
    (token: ThemeColorToken): boolean => {
      const effective = normalizeHex(effectiveToken(token));
      const base = normalizeHex(stock[mode][token]);
      return effective !== null && base !== null && effective !== base;
    },
    [effectiveToken, mode, stock],
  );

  const isLocallyEdited = useCallback(
    (token: ThemeColorToken): boolean => Boolean(drafts[mode]?.[token]),
    [drafts, mode],
  );

  const commitDraftsNow = useCallback(() => {
    clearCommitTimer();
    if (targetKind === 'user' && activeId) {
      storage.updateThemeOverrides(activeId, draftsRef.current);
    }
  }, [activeId, clearCommitTimer, storage, targetKind]);

  const setTokenOverride = useCallback(
    (token: ThemeColorToken, hex: string | null) => {
      setDrafts(prev => {
        const modeDrafts: TokenOverrides = { ...prev[mode] };
        if (hex === null) {
          delete modeDrafts[token];
        } else {
          const normalized = normalizeHex(hex);
          if (!normalized) {
            // Invalid input never lands in drafts (and never in MMKV).
            return prev;
          }
          modeDrafts[token] = normalized;
        }
        return { ...prev, [mode]: modeDrafts };
      });
      if (targetKind === 'user' && activeId) {
        clearCommitTimer();
        commitTimer.current = setTimeout(() => {
          storage.updateThemeOverrides(activeId, draftsRef.current);
        }, COMMIT_DEBOUNCE_MS);
      }
    },
    [activeId, clearCommitTimer, mode, storage, targetKind],
  );

  /** Local-only reset of one mode (persists if the target is a user theme). */
  const resetMode = useCallback(
    (resetTarget: StudioMode) => {
      setDrafts(prev => ({ ...prev, [resetTarget]: {} }));
      if (targetKind === 'user' && activeId) {
        // Flush with the cleared mode included; the other mode's drafts are
        // untouched by definition.
        const flushed = {
          ...draftsRef.current,
          [resetTarget]: {},
        } as ThemeOverrides;
        storage.updateThemeOverrides(activeId, flushed);
      }
    },
    [activeId, storage, targetKind],
  );

  /** Global reset: clear edits and deactivate the studio theme. */
  const resetAll = useCallback(() => {
    clearCommitTimer();
    draftsRef.current = EMPTY_DRAFTS;
    setDrafts(EMPTY_DRAFTS);
    storage.setActiveId(undefined);
  }, [clearCommitTimer, storage]);

  const hasUnsavedChanges = useMemo(
    () => !themeOverridesEqual(drafts, activeBundle),
    [activeBundle, drafts],
  );

  const saveDraftsAsTheme = useCallback(
    (name: string): string => {
      const id = storage.saveTheme(name, draftsRef.current);
      storage.setActiveId(id);
      return id;
    },
    [storage],
  );

  const activatePreset = useCallback(
    (presetId: string) => storage.setActiveId(presetId),
    [storage],
  );

  const deactivate = useCallback(
    () => storage.setActiveId(undefined),
    [storage],
  );

  return {
    // target
    targetKind,
    targetName,
    targetUserTheme,
    activeId,
    // modes & colors
    mode,
    setMode,
    stock,
    applied,
    effectiveColors,
    effectiveToken,
    stockToken,
    isOverridden,
    isLocallyEdited,
    // drafts
    drafts,
    hasUnsavedChanges,
    setTokenOverride,
    commitDraftsNow,
    resetMode,
    resetAll,
    saveDraftsAsTheme,
    activatePreset,
    deactivate,
    // storage passthrough
    storage,
    presets: THEME_PRESETS,
  };
};

export type ThemeStudioEditor = ReturnType<typeof useThemeStudioEditor>;
