import type { ThemeColors } from '@theme/types';

import { normalizeHex } from './color';
import { THEME_PRESETS } from './presets';
import {
  isThemeColorToken,
  ThemeColorToken,
  ThemeOverrides,
  TokenOverrides,
} from './tokens';

/** Bump when the export/import JSON shape changes in a breaking way. */
export const THEME_STUDIO_VERSION = 1;
export const THEME_STUDIO_TYPE = 'lnreader.themeStudio';

export interface ParsedThemeStudio {
  name: string;
  light: TokenOverrides;
  dark: TokenOverrides;
}

export type ParseThemeStudioError =
  | 'empty'
  | 'invalid-json'
  | 'unknown-format'
  | 'unsupported-version';

export type ParseThemeStudioResult =
  | { ok: true; value: ParsedThemeStudio }
  | { ok: false; error: ParseThemeStudioError };

/**
 * Validates arbitrary input (MMKV payload, imported JSON) into a safe
 * `TokenOverrides` object:
 * - non-object input → empty
 * - unknown tokens dropped
 * - non-string / unparseable colors dropped
 * - surviving values normalized to `#rrggbb`
 *
 * Never throws — corrupt data degrades to the underlying MD3 scheme.
 */
export const sanitizeTokenOverrides = (raw: unknown): TokenOverrides => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const result: TokenOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isThemeColorToken(key)) {
      continue;
    }
    const normalized = normalizeHex(value);
    if (normalized) {
      result[key as ThemeColorToken] = normalized;
    }
  }
  return result;
};

/**
 * The single merge point between the MD3 scheme and Theme Studio overrides.
 * Pure, allocation-light and memo-friendly: iterates only over the override
 * keys, everything else falls through to `base`.
 *
 * `mode` selects which half of a `{light, dark}` bundle applies; the wrong
 * mode's tokens are never touched. Metadata (`id`/`name`/`isDark`) cannot be
 * overridden because those keys are outside the token registry.
 */
export const mergeThemeOverrides = (
  base: ThemeColors,
  overrides: ThemeOverrides | undefined,
  mode: 'light' | 'dark',
): ThemeColors => {
  const picked = sanitizeTokenOverrides(overrides?.[mode]);
  const keys = Object.keys(picked) as ThemeColorToken[];
  if (keys.length === 0) {
    return base;
  }
  const merged: ThemeColors = { ...base };
  for (const key of keys) {
    merged[key] = picked[key] as string;
  }
  return merged;
};

/** Counts overrides per mode — used for UI badges ("3 edits"). */
export const countOverrides = (
  overrides: ThemeOverrides | undefined,
): { light: number; dark: number } => ({
  light: Object.keys(sanitizeTokenOverrides(overrides?.light)).length,
  dark: Object.keys(sanitizeTokenOverrides(overrides?.dark)).length,
});

/** Key-independent equality for two override maps (order agnostic). */
export const tokenOverridesEqual = (
  a: TokenOverrides | undefined,
  b: TokenOverrides | undefined,
): boolean => {
  const left = sanitizeTokenOverrides(a);
  const right = sanitizeTokenOverrides(b);
  const leftKeys = Object.keys(left) as ThemeColorToken[];
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  return leftKeys.every(key => left[key] === right[key]);
};

/** Whether local drafts differ from the persisted bundle (unsaved banner). */
export const themeOverridesEqual = (
  a: ThemeOverrides | undefined,
  b: ThemeOverrides | undefined,
): boolean =>
  tokenOverridesEqual(a?.light, b?.light) &&
  tokenOverridesEqual(a?.dark, b?.dark);

const MAX_NAME_LENGTH = 60;

const sanitizeName = (raw: unknown, fallback: string): string => {
  if (typeof raw !== 'string') {
    return fallback;
  }
  const trimmed = raw.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || fallback;
};

/**
 * Serializes a theme to versioned JSON for the clipboard. Values are
 * sanitized first, so the output always round-trips.
 */
export const serializeThemeStudio = (
  name: string,
  overrides: ThemeOverrides,
): string => {
  const payload = {
    version: THEME_STUDIO_VERSION,
    type: THEME_STUDIO_TYPE,
    name: sanitizeName(name, 'Theme'),
    light: sanitizeTokenOverrides(overrides.light),
    dark: sanitizeTokenOverrides(overrides.dark),
  };
  return JSON.stringify(payload, null, 2);
};

/**
 * Strict import validation:
 * - JSON syntax errors → `invalid-json`
 * - missing/different `type` marker → `unknown-format`
 * - `version` !== current (future or past) → `unsupported-version`
 * - unknown tokens / wrong value types dropped silently
 */
export const parseThemeStudio = (raw: string): ParseThemeStudioResult => {
  if (!raw || !raw.trim()) {
    return { ok: false, error: 'empty' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'unknown-format' };
  }
  const record = parsed as Record<string, unknown>;
  if (record.type !== THEME_STUDIO_TYPE) {
    return { ok: false, error: 'unknown-format' };
  }
  if (record.version !== THEME_STUDIO_VERSION) {
    return { ok: false, error: 'unsupported-version' };
  }
  return {
    ok: true,
    value: {
      name: sanitizeName(record.name, 'Theme'),
      light: sanitizeTokenOverrides(record.light),
      dark: sanitizeTokenOverrides(record.dark),
    },
  };
};

export interface StudioUserTheme {
  /** `user:<creation timestamp base36><random>` */
  id: string;
  name: string;
  light: TokenOverrides;
  dark: TokenOverrides;
  createdAt: number;
  updatedAt: number;
}

/** Adapts a stored user theme to the `ThemeOverrides` merge shape. */
export const userThemeToOverrides = (
  theme: StudioUserTheme,
): ThemeOverrides => ({ light: theme.light, dark: theme.dark });

/**
 * Resolves the currently active Theme Studio bundle for `useTheme`:
 * - `undefined`/empty id → no overrides (stock MD3 scheme)
 * - `preset:<key>` → a built-in preset
 * - `user:<id>` → a saved user theme inside the MMKV blob
 * - anything corrupt → `undefined` (defense against bad stored state)
 */
export const resolveStudioBundle = (
  activeId: string | undefined,
  rawUserThemes: string | undefined,
): ThemeOverrides | undefined => {
  if (!activeId) {
    return undefined;
  }

  if (activeId.startsWith('preset:')) {
    const preset = THEME_PRESETS.find(p => p.id === activeId);
    if (!preset) {
      return undefined;
    }
    return { light: { ...preset.light }, dark: { ...preset.dark } };
  }

  if (activeId.startsWith('user:')) {
    const themes = safeParseUserThemes(rawUserThemes);
    const theme = themes.find(t => t.id === activeId);
    if (!theme) {
      return undefined;
    }
    return userThemeToOverrides(theme);
  }

  return undefined;
};

/** Parses the stored user-theme array; corrupt entries are skipped. */
export const safeParseUserThemes = (
  raw: string | undefined,
): StudioUserTheme[] => {
  if (!raw) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const now = Date.now();
  const themes: StudioUserTheme[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id.startsWith('user:')) {
      continue;
    }
    themes.push({
      id: record.id,
      name: sanitizeName(record.name, 'Theme'),
      light: sanitizeTokenOverrides(record.light),
      dark: sanitizeTokenOverrides(record.dark),
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : now,
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : now,
    });
  }
  return themes;
};

/** Stable-ish unique id for user themes. */
export const createUserThemeId = (): string =>
  `user:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
