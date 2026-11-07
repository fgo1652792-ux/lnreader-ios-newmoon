import { useCallback, useMemo } from 'react';
import { useMMKVString } from 'react-native-mmkv';

import { MMKVStorage } from '@utils/mmkv/mmkv';

import {
  createUserThemeId,
  safeParseUserThemes,
  StudioUserTheme,
} from './overrides';
import { ThemeOverrides, TokenOverrides } from './tokens';

/**
 * MMKV keys for Theme Studio. Versioned suffix like the rest of the app's
 * persisted keys so a future format change can migrate safely.
 */
export const THEME_STUDIO_THEMES_KEY = '@theme_studio_custom_themes_v1';
export const THEME_STUDIO_ACTIVE_KEY = '@theme_studio_active_v1';

const MAX_USER_THEMES = 30;

/**
 * Read/write access to Theme Studio persistence:
 * - the saved user themes blob (JSON array)
 * - the active theme pointer (`preset:<key>` | `user:<id>` | undefined)
 *
 * `useTheme` reads the exact same two keys, so committing here re-renders
 * the app theme through the normal MMKV subscription — no custom bus needed.
 */
export const useThemeStudioStorage = () => {
  const [rawThemes, setRawThemes] = useMMKVString(THEME_STUDIO_THEMES_KEY);
  const [activeId, setActiveId] = useMMKVString(THEME_STUDIO_ACTIVE_KEY);

  const userThemes = useMemo(() => safeParseUserThemes(rawThemes), [rawThemes]);

  const writeThemes = useCallback(
    (themes: StudioUserTheme[]) => {
      setRawThemes(JSON.stringify(themes));
    },
    [setRawThemes],
  );

  const upsertTheme = useCallback(
    (theme: StudioUserTheme) => {
      const themes = safeParseUserThemes(
        MMKVStorage.getString(THEME_STUDIO_THEMES_KEY),
      );
      const index = themes.findIndex(t => t.id === theme.id);
      if (index >= 0) {
        themes[index] = theme;
      } else {
        themes.unshift(theme);
        if (themes.length > MAX_USER_THEMES) {
          themes.length = MAX_USER_THEMES;
        }
      }
      writeThemes(themes);
    },
    [writeThemes],
  );

  /** Creates a new named theme and returns its id. */
  const saveTheme = useCallback(
    (name: string, overrides: ThemeOverrides): string => {
      const id = createUserThemeId();
      const now = Date.now();
      upsertTheme({
        id,
        name,
        light: overrides.light ?? {},
        dark: overrides.dark ?? {},
        createdAt: now,
        updatedAt: now,
      });
      return id;
    },
    [upsertTheme],
  );

  /** Persists new overrides into an existing user theme (auto-commit path). */
  const updateThemeOverrides = useCallback(
    (id: string, overrides: ThemeOverrides) => {
      const themes = safeParseUserThemes(
        MMKVStorage.getString(THEME_STUDIO_THEMES_KEY),
      );
      const index = themes.findIndex(t => t.id === id);
      if (index < 0) {
        return;
      }
      upsertTheme({
        ...themes[index],
        light: overrides.light ?? {},
        dark: overrides.dark ?? {},
        updatedAt: Date.now(),
      });
    },
    [upsertTheme],
  );

  const renameTheme = useCallback(
    (id: string, name: string) => {
      const themes = safeParseUserThemes(
        MMKVStorage.getString(THEME_STUDIO_THEMES_KEY),
      );
      const index = themes.findIndex(t => t.id === id);
      if (index < 0) {
        return;
      }
      upsertTheme({ ...themes[index], name, updatedAt: Date.now() });
    },
    [upsertTheme],
  );

  const duplicateTheme = useCallback(
    (id: string, copyName: string): string | null => {
      const themes = safeParseUserThemes(
        MMKVStorage.getString(THEME_STUDIO_THEMES_KEY),
      );
      const source = themes.find(t => t.id === id);
      if (!source) {
        return null;
      }
      const newId = createUserThemeId();
      const now = Date.now();
      upsertTheme({
        ...source,
        id: newId,
        name: copyName,
        createdAt: now,
        updatedAt: now,
      });
      return newId;
    },
    [upsertTheme],
  );

  /** Deletes a theme; clears the active pointer if it pointed at it. */
  const deleteTheme = useCallback(
    (id: string) => {
      const themes = safeParseUserThemes(
        MMKVStorage.getString(THEME_STUDIO_THEMES_KEY),
      );
      writeThemes(themes.filter(t => t.id !== id));
      if (activeId === id) {
        setActiveId(undefined);
      }
    },
    [activeId, setActiveId, writeThemes],
  );

  return {
    userThemes,
    activeId,
    setActiveId,
    saveTheme,
    updateThemeOverrides,
    renameTheme,
    duplicateTheme,
    deleteTheme,
  };
};

export type ThemeStudioStorage = ReturnType<typeof useThemeStudioStorage>;

/** Token overrides shaped for one mode — convenience for callers. */
export const toOverrides = (
  light: TokenOverrides | undefined,
  dark: TokenOverrides | undefined,
): ThemeOverrides => ({ light, dark });
