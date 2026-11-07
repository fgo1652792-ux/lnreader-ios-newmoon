// lnreader-ios/src/theme/customTheme.ts
//
// Advanced appearance customizer core: per-mode (light/dark) token overrides
// on top of ANY base theme, with WCAG contrast checking and named presets.
//
// Safety rules:
//  • only valid #RGB/#RRGGBB/#RRGGBBAA values are ever applied — a corrupted
//    or foreign payload degrades to "no override" instead of crashing;
//  • overrides land BEFORE addComputedColors() in useTheme, so derived tokens
//    (rippleColor, surfaceContainerLow, …) stay consistent with the override;
//  • light and dark customizations are independent and only apply in their
//    own color-scheme mode.

import { MD3ThemeType, ThemeColors } from './types';
import { getMMKVObject, setMMKVObject, MMKVStorage } from '@utils/mmkv/mmkv';

export const CUSTOM_THEME_OVERRIDES_KEY = 'CUSTOM_THEME_OVERRIDES';
export const CUSTOM_THEME_SAVED_KEY = 'CUSTOM_THEME_SAVED';

export type CustomThemeOverrides = Partial<Record<keyof MD3ThemeType, string>>;

export type CustomThemeOverridesByMode = {
  light: CustomThemeOverrides;
  dark: CustomThemeOverrides;
};

export type SavedCustomTheme = {
  id: string;
  name: string;
  light: CustomThemeOverrides;
  dark: CustomThemeOverrides;
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_RE.test(value.trim());

/** Filters an overrides object down to valid hex values on valid keys only. */
export const sanitizeOverrides = (
  overrides: unknown,
): CustomThemeOverrides => {
  if (!overrides || typeof overrides !== 'object') {
    return {};
  }
  const out: CustomThemeOverrides = {};
  for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
    if (isHexColor(value) && MD3_TOKENS.has(key)) {
      out[key as keyof MD3ThemeType] = value.trim();
    }
  }
  return out;
};

/** Runtime token whitelist (kept in sync with MD3ThemeType). */
export const MD3_TOKENS = new Set<string>([
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'background',
  'onBackground',
  'surface',
  'onSurface',
  'surfaceVariant',
  'onSurfaceVariant',
  'outline',
  'outlineVariant',
  'shadow',
  'scrim',
  'inverseSurface',
  'inverseOnSurface',
  'inversePrimary',
  'surfaceDisabled',
  'onSurfaceDisabled',
  'backdrop',
]);

/** Applies valid overrides for the current mode (pure). */
export const applyOverrides = (
  colors: ThemeColors,
  overrides: CustomThemeOverrides | undefined,
): ThemeColors => {
  const safe = sanitizeOverrides(overrides);
  if (Object.keys(safe).length === 0) {
    return colors;
  }
  // safe is validated (hex strings on MD3 tokens only) — the cast narrows the
  // Partial<Record<keyof MD3ThemeType, string>> spread for TS.
  return { ...colors, ...safe } as ThemeColors;
};

// ------------------------------------------------------------- contrast ---
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const channelLuminance = (c: number): number =>
  c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** WCAG 2.x relative luminance of a hex color (0..1). */
export const relativeLuminance = (hex: string): number => {
  if (!isHexColor(hex)) {
    return 0;
  }
  let h = hex.trim().slice(1);
  if (h.length === 3 || h.length === 4) {
    h = h
      .slice(0, 3)
      .split('')
      .map(c => c + c)
      .join('');
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return (
    0.2126 * channelLuminance(clamp01(r)) +
    0.7152 * channelLuminance(clamp01(g)) +
    0.0722 * channelLuminance(clamp01(b))
  );
};

/** WCAG contrast ratio (1..21). Invalid colors → 1 (unreadable). */
export const contrastRatio = (a: string, b: string): number => {
  if (!isHexColor(a) || !isHexColor(b)) {
    return 1;
  }
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
};

/** WCAG AA body-text threshold. */
export const MIN_TEXT_CONTRAST = 4.5;

export const isReadablePair = (text: string, background: string): boolean =>
  contrastRatio(text, background) >= MIN_TEXT_CONTRAST;

// ------------------------------------------------------------ persistence ---
export const EMPTY_OVERRIDES: CustomThemeOverridesByMode = {
  light: {},
  dark: {},
};

export const loadCustomOverrides = (): CustomThemeOverridesByMode => {
  const stored = getMMKVObject<Partial<CustomThemeOverridesByMode>>(
    CUSTOM_THEME_OVERRIDES_KEY,
  );
  return {
    light: sanitizeOverrides(stored?.light),
    dark: sanitizeOverrides(stored?.dark),
  };
};

export const saveCustomOverrides = (
  next: CustomThemeOverridesByMode,
): void => {
  setMMKVObject(CUSTOM_THEME_OVERRIDES_KEY, {
    light: sanitizeOverrides(next.light),
    dark: sanitizeOverrides(next.dark),
  });
};

export const resetCustomOverrides = (mode?: 'light' | 'dark'): void => {
  if (!mode) {
    MMKVStorage.remove(CUSTOM_THEME_OVERRIDES_KEY);
    return;
  }
  const current = loadCustomOverrides();
  saveCustomOverrides({ ...current, [mode]: {} });
};

// -------------------------------------------------------------- presets ---
export const listSavedCustomThemes = (): SavedCustomTheme[] => {
  const stored = getMMKVObject<SavedCustomTheme[]>(CUSTOM_THEME_SAVED_KEY);
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored
    .filter(t => t && typeof t.id === 'string' && typeof t.name === 'string')
    .map(t => ({
      id: t.id,
      name: t.name,
      light: sanitizeOverrides(t.light),
      dark: sanitizeOverrides(t.dark),
    }));
};

export const saveCustomThemePreset = (
  name: string,
  overrides: CustomThemeOverridesByMode,
): SavedCustomTheme[] => {
  const list = listSavedCustomThemes().filter(t => t.name !== name.trim());
  const entry: SavedCustomTheme = {
    id: Date.now().toString(36),
    name: name.trim(),
    light: sanitizeOverrides(overrides.light),
    dark: sanitizeOverrides(overrides.dark),
  };
  const next = [entry, ...list].slice(0, 30);
  setMMKVObject(CUSTOM_THEME_SAVED_KEY, next);
  return next;
};

export const deleteCustomThemePreset = (id: string): SavedCustomTheme[] => {
  const next = listSavedCustomThemes().filter(t => t.id !== id);
  setMMKVObject(CUSTOM_THEME_SAVED_KEY, next);
  return next;
};
