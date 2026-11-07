import type { MD3ThemeType } from '@theme/types';

/**
 * The exact set of ThemeColors keys Theme Studio can edit.
 *
 * Derived from the real token names in `src/theme/types/index.ts` — no
 * invented tokens. The metadata keys (`id`, `name`, `isDark`) are excluded:
 * they are structural, not colors.
 *
 * `surfaceContainerLow` / `surfaceContainerHigh` / `surface2` / `overlay3` /
 * `rippleColor` / `surfaceReader` are the optional keys of `ThemeColors`;
 * the first two are recomputed from `surface` by `useTheme` *unless* the
 * override layer sets them explicitly (see overrides.ts).
 */
export const THEME_COLOR_TOKENS = [
  // Backgrounds & surfaces
  'background',
  'onBackground',
  'surface',
  'onSurface',
  'surfaceVariant',
  'onSurfaceVariant',
  'surfaceContainerLow',
  'surfaceContainerHigh',
  // Primary (buttons, FABs, selection)
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  // Secondary
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  // Tertiary
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  // Error (the palette has no dedicated success/warning tokens)
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  // Outlines, dividers & disabled
  'outline',
  'outlineVariant',
  'surfaceDisabled',
  'onSurfaceDisabled',
  // Inverse surfaces, scrim & shadow
  'inverseSurface',
  'inverseOnSurface',
  'inversePrimary',
  'backdrop',
  'scrim',
  'shadow',
  // Advanced extras (elevation overlays / ripple / reader surface)
  'surface2',
  'overlay3',
  'rippleColor',
  'surfaceReader',
] as const;

export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];

const TOKEN_SET: ReadonlySet<string> = new Set(THEME_COLOR_TOKENS);

export const isThemeColorToken = (key: unknown): key is ThemeColorToken =>
  typeof key === 'string' && TOKEN_SET.has(key);

/** Keys of ThemeColors that must never be overridden. */
export const THEME_METADATA_KEYS: readonly (keyof MD3ThemeType)[] = [
  'id',
  'name',
  'isDark',
] as const;

export type TokenOverrides = Partial<Record<ThemeColorToken, string>>;

export interface ThemeOverrides {
  light?: TokenOverrides;
  dark?: TokenOverrides;
}

export interface TokenGroup {
  id: string;
  /** i18n key under `themeStudio.groups.*` */
  titleKey: string;
  tokens: readonly ThemeColorToken[];
}

/**
 * UI grouping for the editor. Order matters: surfaces first (everything sits
 * on them), then accents, then structural colors.
 */
export const TOKEN_GROUPS: readonly TokenGroup[] = [
  {
    id: 'surfaces',
    titleKey: 'surfaces',
    tokens: [
      'background',
      'onBackground',
      'surface',
      'onSurface',
      'surfaceVariant',
      'onSurfaceVariant',
      'surfaceContainerLow',
      'surfaceContainerHigh',
    ],
  },
  {
    id: 'primary',
    titleKey: 'primary',
    tokens: ['primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer'],
  },
  {
    id: 'secondary',
    titleKey: 'secondary',
    tokens: [
      'secondary',
      'onSecondary',
      'secondaryContainer',
      'onSecondaryContainer',
    ],
  },
  {
    id: 'tertiary',
    titleKey: 'tertiary',
    tokens: [
      'tertiary',
      'onTertiary',
      'tertiaryContainer',
      'onTertiaryContainer',
    ],
  },
  {
    id: 'error',
    titleKey: 'error',
    tokens: ['error', 'onError', 'errorContainer', 'onErrorContainer'],
  },
  {
    id: 'outlines',
    titleKey: 'outlines',
    tokens: [
      'outline',
      'outlineVariant',
      'surfaceDisabled',
      'onSurfaceDisabled',
    ],
  },
  {
    id: 'inverse',
    titleKey: 'inverse',
    tokens: [
      'inverseSurface',
      'inverseOnSurface',
      'inversePrimary',
      'backdrop',
      'scrim',
      'shadow',
    ],
  },
  {
    id: 'advanced',
    titleKey: 'advanced',
    tokens: ['surface2', 'overlay3', 'rippleColor', 'surfaceReader'],
  },
];

/** WCAG minimum ratios. */
export const CONTRAST_AA_TEXT = 4.5;
export const CONTRAST_AA_LARGE_OR_ICON = 3;

export type ContrastLevel = 'text' | 'icon';

export interface ContrastPair {
  fg: ThemeColorToken;
  bg: ThemeColorToken;
  min: number;
  level: ContrastLevel;
}

const textPair = (fg: ThemeColorToken, bg: ThemeColorToken): ContrastPair => ({
  fg,
  bg,
  min: CONTRAST_AA_TEXT,
  level: 'text',
});

const iconPair = (fg: ThemeColorToken, bg: ThemeColorToken): ContrastPair => ({
  fg,
  bg,
  min: CONTRAST_AA_LARGE_OR_ICON,
  level: 'icon',
});

/**
 * Text/icon pairs checked inside the editor. Normal text requires 4.5:1;
 * icons and large text 3:1 (WCAG AA). Disabled-content pairs are
 * intentionally omitted — WCAG exempts disabled controls.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  textPair('onBackground', 'background'),
  textPair('onSurface', 'surface'),
  textPair('onSurface', 'surfaceVariant'),
  textPair('onSurfaceVariant', 'surface'),
  textPair('onSurfaceVariant', 'surfaceVariant'),
  textPair('onPrimary', 'primary'),
  textPair('onSecondary', 'secondary'),
  textPair('onTertiary', 'tertiary'),
  textPair('onError', 'error'),
  textPair('onPrimaryContainer', 'primaryContainer'),
  textPair('onSecondaryContainer', 'secondaryContainer'),
  textPair('onTertiaryContainer', 'tertiaryContainer'),
  textPair('onErrorContainer', 'errorContainer'),
  textPair('inverseOnSurface', 'inverseSurface'),
  iconPair('inversePrimary', 'inverseSurface'),
  iconPair('primary', 'surface'),
  iconPair('secondary', 'surface'),
];

/**
 * The background each text/icon token is primarily rendered against — used
 * for the inline hint inside the color editor.
 */
export const TOKEN_CONTRAST_PARTNER: Partial<
  Record<ThemeColorToken, ContrastPair>
> = (() => {
  const map: Partial<Record<ThemeColorToken, ContrastPair>> = {};
  for (const pair of CONTRAST_PAIRS) {
    // First pair wins so `onSurface` keeps its dedicated surface pairing.
    if (!map[pair.fg]) {
      map[pair.fg] = pair;
    }
  }
  return map;
})();
