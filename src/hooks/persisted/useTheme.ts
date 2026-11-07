import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  PropsWithChildren,
} from 'react';
import { Appearance, AppState, ColorSchemeName } from 'react-native';
import {
  useMMKVBoolean,
  useMMKVNumber,
  useMMKVString,
} from 'react-native-mmkv';
import type { Material3Theme } from '@pchmn/expo-material3-theme';
import { overlay } from 'react-native-paper';
import Color from 'color';

import { ThemeColors } from '@theme/types';
import { darkThemes, lightThemes } from '@theme/md3';
import {
  DYNAMIC_THEME_ID,
  getSystemDynamicTheme,
  isDynamicThemeAvailable,
  toDynamicThemeColors,
} from '@theme/dynamic';
import {
  mergeThemeOverrides,
  resolveStudioBundle,
} from '@theme/studio/overrides';
import type { ThemeOverrides } from '@theme/studio/tokens';
import {
  THEME_STUDIO_ACTIVE_KEY,
  THEME_STUDIO_THEMES_KEY,
} from '@theme/studio/storage';

const getElevationColor = (colors: ThemeColors, elevation: number): string => {
  return Color(colors.surface)
    .mix(Color(colors.primary), elevation)
    .rgb()
    .string();
};

const getSurfaceContainerHigh = (colors: ThemeColors): string =>
  Color(colors.surface)
    .mix(Color(colors.onSurface), colors.isDark ? 0.1 : 0.08)
    .rgb()
    .string();

const getSurfaceContainerLow = (colors: ThemeColors): string =>
  Color(colors.surface)
    .mix(Color(colors.onSurface), colors.isDark ? 0.05 : 0.04)
    .rgb()
    .string();

const addComputedColors = (colors: ThemeColors): ThemeColors => ({
  ...colors,
  surfaceContainerLow: getSurfaceContainerLow(colors),
  surfaceContainerHigh: getSurfaceContainerHigh(colors),
  surface2: getElevationColor(colors, 0.08),
  overlay3: overlay(3, colors.surface),
  rippleColor: Color(colors.primary).alpha(0.12).toString(),
  surfaceReader: Color(colors.surface).alpha(0.9).toString(),
});

const applyAmoledBlack = (
  colors: ThemeColors,
  isEnabled: boolean,
): ThemeColors => {
  if (!isEnabled || !colors.isDark) {
    return colors;
  }

  return {
    ...colors,
    background: '#000000',
    surface: '#000000',
  };
};

const applyCustomAccent = (
  colors: ThemeColors,
  accentColor?: string,
): ThemeColors => {
  if (!accentColor) {
    return colors;
  }

  return {
    ...colors,
    primary: accentColor,
    secondary: accentColor,
  };
};

const findThemeById = (
  themeId: number | undefined,
  isDark: boolean,
): ThemeColors => {
  const themeList = isDark ? darkThemes : lightThemes;
  let theme: ThemeColors | undefined;
  if (themeId !== undefined) {
    const id = transformThemeId(themeId, isDark);
    theme = themeList.find(t => t.id === id);
  }

  return theme ?? themeList[0];
};

// transforms legacy theme IDs to new IDs
function transformThemeId(themeId: number, isDark: boolean): number {
  if (themeId > 99) return themeId;
  const lightIdMap: Record<number, number> = {
    '1': 100,
    '8': 102,
    '9': 108,
    '10': 101,
    '12': 103,
    '14': 104,
    '16': 105,
    '18': 106,
    '20': 107,
  };
  const darkIdMap: Record<number, number> = {
    '2': 100,
    '9': 102,
    '10': 108,
    '11': 101,
    '13': 103,
    '15': 104,
    '17': 105,
    '19': 106,
    '21': 107,
  };
  if (isDark) {
    return darkIdMap[themeId] ?? themeId;
  }
  return lightIdMap[themeId] ?? themeId;
}

export interface ThemeBuildInput {
  themeMode: string;
  themeId: number | undefined;
  dynamicTheme: Material3Theme;
  isAmoledBlack: boolean;
  customAccent: string | undefined;
}

/**
 * Computes the final `ThemeColors` for one light/dark mode.
 *
 * Pipeline (unchanged order, Theme Studio merged in before computed colors so
 * derived colors like `surfaceContainerLow` stay consistent with overridden
 * surfaces):
 *   base scheme → AMOLED black → custom accent → studio overrides → computed
 *
 * `isDark` is an explicit argument (not derived from `themeMode`) so Theme
 * Studio can build both modes' bases without forking the theme system.
 */
export const buildThemeColors = (
  input: ThemeBuildInput,
  isDark: boolean,
  studioBundle: ThemeOverrides | undefined,
): ThemeColors => {
  let baseTheme: ThemeColors;
  if (input.themeId === DYNAMIC_THEME_ID && isDynamicThemeAvailable) {
    baseTheme = toDynamicThemeColors(input.dynamicTheme, isDark);
  } else {
    baseTheme = findThemeById(input.themeId, isDark);
  }

  const withAmoled = applyAmoledBlack(baseTheme, input.isAmoledBlack);
  const withAccent = applyCustomAccent(withAmoled, input.customAccent);
  const withStudio = mergeThemeOverrides(
    withAccent,
    studioBundle,
    isDark ? 'dark' : 'light',
  );

  return addComputedColors(withStudio);
};

const ThemeContext = createContext<ThemeColors | null>(null);

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const [themeId] = useMMKVNumber('APP_THEME_ID');
  const [themeMode = 'system'] = useMMKVString('THEME_MODE');
  const [isAmoledBlack = false] = useMMKVBoolean('AMOLED_BLACK');
  const [customAccent] = useMMKVString('CUSTOM_ACCENT_COLOR');
  const [studioActiveId] = useMMKVString(THEME_STUDIO_ACTIVE_KEY);
  const [studioThemesRaw] = useMMKVString(THEME_STUDIO_THEMES_KEY);

  const [systemColorScheme, setSystemColorScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme() ?? 'unspecified',
  );
  const [dynamicTheme, setDynamicTheme] = useState(getSystemDynamicTheme);

  useEffect(() => {
    const appearanceSubscription = Appearance.addChangeListener(
      ({ colorScheme }) => {
        setSystemColorScheme(colorScheme);
      },
    );
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active' && isDynamicThemeAvailable) {
        setDynamicTheme(getSystemDynamicTheme());
      }
    });

    return () => {
      appearanceSubscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  const studioBundle = useMemo<ThemeOverrides | undefined>(
    () => resolveStudioBundle(studioActiveId, studioThemesRaw),
    [studioActiveId, studioThemesRaw],
  );

  const isDark =
    themeMode === 'system'
      ? systemColorScheme === 'dark'
      : themeMode === 'dark';

  const theme = useMemo<ThemeColors>(
    () =>
      buildThemeColors(
        {
          themeMode,
          themeId,
          dynamicTheme,
          isAmoledBlack,
          customAccent,
        },
        isDark,
        studioBundle,
      ),
    [
      themeId,
      themeMode,
      dynamicTheme,
      isAmoledBlack,
      customAccent,
      studioBundle,
      isDark,
    ],
  );

  return createElement(ThemeContext.Provider, { value: theme }, children);
};

export const useTheme = (): ThemeColors => {
  const theme = useContext(ThemeContext);
  if (!theme) {
    // eslint-disable-next-line no-console
    console.error('useTheme must be used within a <ThemeProvider />');
    return {} as ThemeColors;
  }

  return theme;
};
