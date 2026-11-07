import type { ThemeColors } from '@theme/types';

import {
  countOverrides,
  createUserThemeId,
  mergeThemeOverrides,
  parseThemeStudio,
  resolveStudioBundle,
  safeParseUserThemes,
  sanitizeTokenOverrides,
  serializeThemeStudio,
  themeOverridesEqual,
  tokenOverridesEqual,
  userThemeToOverrides,
} from '../overrides';

const baseTheme: ThemeColors = {
  id: 100,
  name: 'Default',
  isDark: false,
  primary: '#0057ce',
  onPrimary: '#ffffff',
  primaryContainer: '#dae2ff',
  onPrimaryContainer: '#001946',
  secondary: '#585e71',
  onSecondary: '#ffffff',
  secondaryContainer: '#dce2f9',
  onSecondaryContainer: '#151b2c',
  tertiary: '#725572',
  onTertiary: '#ffffff',
  tertiaryContainer: '#fdd7fa',
  onTertiaryContainer: '#2a122c',
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#410002',
  background: '#fefbff',
  onBackground: '#1b1b1f',
  surface: '#fefbff',
  onSurface: '#1b1b1f',
  surfaceVariant: '#e1e2ec',
  onSurfaceVariant: '#44464f',
  outline: '#757780',
  outlineVariant: '#c5c6d0',
  shadow: '#000000',
  scrim: '#000000',
  inverseSurface: '#303034',
  inverseOnSurface: '#f2f0f4',
  inversePrimary: '#b1c5ff',
  surfaceDisabled: 'rgba(27, 27, 31, 0.12)',
  onSurfaceDisabled: 'rgba(27, 27, 31, 0.38)',
  backdrop: 'rgba(46, 48, 56, 0.4)',
};

describe('sanitizeTokenOverrides', () => {
  it('keeps known tokens and normalizes their values', () => {
    const result = sanitizeTokenOverrides({
      primary: '#AABBCC',
      surface: 'rgb(1, 2, 3)',
    });
    expect(result).toEqual({ primary: '#aabbcc', surface: '#010203' });
  });

  it('drops unknown tokens', () => {
    const result = sanitizeTokenOverrides({
      primary: '#112233',
      notAToken: '#445566',
      background2: '#445566',
    });
    expect(result).toEqual({ primary: '#112233' });
  });

  it('drops wrong value types instead of crashing', () => {
    const result = sanitizeTokenOverrides({
      primary: 42,
      surface: true,
      background: null,
      onSurface: { hex: '#112233' },
      onBackground: ['#112233'],
      outline: undefined,
    });
    expect(result).toEqual({});
  });

  it('drops unparseable color strings', () => {
    expect(sanitizeTokenOverrides({ primary: 'garbage' })).toEqual({});
    expect(sanitizeTokenOverrides({ primary: 'red' })).toEqual({});
  });

  it('returns empty for non-object input', () => {
    expect(sanitizeTokenOverrides(null)).toEqual({});
    expect(sanitizeTokenOverrides(undefined)).toEqual({});
    expect(sanitizeTokenOverrides('primary')).toEqual({});
    expect(sanitizeTokenOverrides(42)).toEqual({});
    expect(sanitizeTokenOverrides(['#112233'])).toEqual({});
  });
});

describe('mergeThemeOverrides', () => {
  it('applies overrides for the matching mode only', () => {
    const overrides = {
      light: { primary: '#112233' },
      dark: { surface: '#000000' },
    };
    const light = mergeThemeOverrides(baseTheme, overrides, 'light');
    expect(light.primary).toBe('#112233');
    expect(light.surface).toBe(baseTheme.surface);

    const dark = mergeThemeOverrides(baseTheme, overrides, 'dark');
    expect(dark.surface).toBe('#000000');
    expect(dark.primary).toBe(baseTheme.primary);
  });

  it('lets missing keys fall through to the base theme', () => {
    const merged = mergeThemeOverrides(
      baseTheme,
      { light: { primary: '#112233' } },
      'light',
    );
    expect(merged.onPrimary).toBe(baseTheme.onPrimary);
    expect(merged.background).toBe(baseTheme.background);
    expect(merged.outlineVariant).toBe(baseTheme.outlineVariant);
  });

  it('preserves the metadata keys (id/name/isDark) untouched', () => {
    const merged = mergeThemeOverrides(
      baseTheme,
      // @ts-expect-error — deliberately hostile stored payload
      { light: { id: 999, name: 'hacked', isDark: true, primary: '#112233' } },
      'light',
    );
    expect(merged.id).toBe(baseTheme.id);
    expect(merged.name).toBe(baseTheme.name);
    expect(merged.isDark).toBe(baseTheme.isDark);
    expect(merged.primary).toBe('#112233');
  });

  it('falls back to the base token when a stored value is corrupt', () => {
    const merged = mergeThemeOverrides(
      baseTheme,
      // @ts-expect-error — corrupt persisted value
      { light: { primary: 'not-a-color', background: 12345 } },
      'light',
    );
    expect(merged).toBe(baseTheme);
  });

  it('returns the base reference when there is nothing to merge', () => {
    expect(mergeThemeOverrides(baseTheme, undefined, 'light')).toBe(baseTheme);
    expect(mergeThemeOverrides(baseTheme, {}, 'dark')).toBe(baseTheme);
    expect(mergeThemeOverrides(baseTheme, { light: {} }, 'dark')).toBe(
      baseTheme,
    );
  });
});

describe('override equality & counts', () => {
  it('counts sanitized overrides per mode', () => {
    expect(
      countOverrides({
        light: { primary: '#112233' },
        dark: { surface: 'oops' },
      }),
    ).toEqual({ light: 1, dark: 0 });
  });

  it('compares override maps order-independently', () => {
    expect(
      tokenOverridesEqual(
        { primary: '#112233', surface: '#445566' },
        { surface: '#445566', primary: '#112233' },
      ),
    ).toBe(true);
    expect(
      tokenOverridesEqual({ primary: '#112233' }, { primary: '#112234' }),
    ).toBe(false);
    expect(
      tokenOverridesEqual(
        { primary: '#112233' },
        { primary: '#112233', surface: '#ffffff' },
      ),
    ).toBe(false);
    expect(tokenOverridesEqual(undefined, {})).toBe(true);
  });

  it('compares full bundles across modes', () => {
    expect(
      themeOverridesEqual(
        { light: { primary: '#112233' }, dark: {} },
        { light: { primary: '#112233' } },
      ),
    ).toBe(true);
    expect(themeOverridesEqual({ light: { primary: '#112233' } }, {})).toBe(
      false,
    );
  });
});

describe('export / import round-trip', () => {
  it('round-trips a sanitized theme', () => {
    const json = serializeThemeStudio('My theme', {
      light: { primary: '#ABCDEF', background: 'rgb(250, 250, 240)' },
      dark: { surface: '#000000' },
    });
    const parsed = parseThemeStudio(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.name).toBe('My theme');
    expect(parsed.value.light).toEqual({
      primary: '#abcdef',
      background: '#fafaf0',
    });
    expect(parsed.value.dark).toEqual({ surface: '#000000' });
  });

  it('rejects empty input', () => {
    expect(parseThemeStudio('')).toEqual({ ok: false, error: 'empty' });
    expect(parseThemeStudio('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects invalid JSON', () => {
    expect(parseThemeStudio('{not json')).toEqual({
      ok: false,
      error: 'invalid-json',
    });
  });

  it('rejects payloads without the Theme Studio type marker', () => {
    expect(parseThemeStudio('{}')).toEqual({
      ok: false,
      error: 'unknown-format',
    });
    expect(
      parseThemeStudio(JSON.stringify({ type: 'some.other.app', version: 1 })),
    ).toEqual({ ok: false, error: 'unknown-format' });
    expect(parseThemeStudio('[]')).toEqual({
      ok: false,
      error: 'unknown-format',
    });
    expect(parseThemeStudio('null')).toEqual({
      ok: false,
      error: 'unknown-format',
    });
  });

  it('rejects version mismatches (past and future)', () => {
    const future = JSON.stringify({
      type: 'lnreader.themeStudio',
      version: 2,
      name: 'x',
    });
    expect(parseThemeStudio(future)).toEqual({
      ok: false,
      error: 'unsupported-version',
    });
    // Version must be the number 1 — "1" (string) is rejected.
    const stringVersion = JSON.stringify({
      type: 'lnreader.themeStudio',
      version: '1',
    });
    expect(parseThemeStudio(stringVersion)).toEqual({
      ok: false,
      error: 'unsupported-version',
    });
  });

  it('drops unknown tokens and wrong types on import (defense in depth)', () => {
    const payload = JSON.stringify({
      type: 'lnreader.themeStudio',
      version: 1,
      name: 'Imported',
      light: { primary: '#112233', evilUnknown: '#445566', surface: 7 },
      dark: { background: 'not-a-color', onSurface: '#dddddd' },
    });
    const parsed = parseThemeStudio(payload);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.light).toEqual({ primary: '#112233' });
    expect(parsed.value.dark).toEqual({ onSurface: '#dddddd' });
  });

  it('falls back to a safe name for wrong-typed names', () => {
    const payload = JSON.stringify({
      type: 'lnreader.themeStudio',
      version: 1,
      name: 42,
    });
    const parsed = parseThemeStudio(payload);
    expect(parsed.ok).toBe(true);
    const name = parsed.ok ? parsed.value.name : null;
    expect(name).toBe('Theme');
  });
});

describe('resolveStudioBundle', () => {
  it('returns undefined when nothing is active', () => {
    expect(resolveStudioBundle(undefined, undefined)).toBeUndefined();
    expect(resolveStudioBundle('', '{}')).toBeUndefined();
  });

  it('resolves built-in presets', () => {
    const bundle = resolveStudioBundle('preset:sepia', undefined);
    expect(bundle).toBeDefined();
    expect(bundle?.light?.primary).toBe('#8a5a2b');
    expect(bundle?.dark?.primary).toBe('#e2b886');
  });

  it('returns undefined for unknown presets', () => {
    expect(
      resolveStudioBundle('preset:does-not-exist', undefined),
    ).toBeUndefined();
  });

  it('resolves user themes from the stored blob', () => {
    const blob = JSON.stringify([
      {
        id: 'user:abc',
        name: 'Mine',
        light: { primary: '#123456' },
        dark: {},
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const bundle = resolveStudioBundle('user:abc', blob);
    expect(bundle?.light?.primary).toBe('#123456');
  });

  it('returns undefined for missing users, corrupt blobs or garbage ids', () => {
    expect(resolveStudioBundle('user:missing', '[]')).toBeUndefined();
    expect(resolveStudioBundle('user:missing', '{corrupt')).toBeUndefined();
    expect(resolveStudioBundle('garbage-id', '[]')).toBeUndefined();
  });
});

describe('safeParseUserThemes', () => {
  it('parses valid theme arrays', () => {
    const blob = JSON.stringify([
      {
        id: 'user:1',
        name: 'A',
        light: { primary: '#111111' },
        dark: { surface: '#222222' },
        createdAt: 10,
        updatedAt: 20,
      },
    ]);
    const themes = safeParseUserThemes(blob);
    expect(themes).toHaveLength(1);
    expect(themes[0].name).toBe('A');
    expect(themes[0].light.primary).toBe('#111111');
  });

  it('skips corrupt entries and fills defaults', () => {
    const blob = JSON.stringify([
      null,
      'nope',
      { id: 'not-user-prefixed', name: 'X' },
      { id: 'user:2', name: 99 },
    ]);
    const themes = safeParseUserThemes(blob);
    expect(themes).toHaveLength(1);
    expect(themes[0].id).toBe('user:2');
    expect(themes[0].name).toBe('Theme');
    expect(themes[0].light).toEqual({});
  });

  it('never throws on corrupt storage', () => {
    expect(safeParseUserThemes(undefined)).toEqual([]);
    expect(safeParseUserThemes('')).toEqual([]);
    expect(safeParseUserThemes('{corrupt')).toEqual([]);
    expect(safeParseUserThemes('"just a string"')).toEqual([]);
    expect(safeParseUserThemes('42')).toEqual([]);
  });
});

describe('user theme helpers', () => {
  it('creates ids with the user: prefix', () => {
    expect(createUserThemeId()).toMatch(/^user:/);
  });

  it('adapts a stored theme to the merge shape', () => {
    const overrides = userThemeToOverrides({
      id: 'user:1',
      name: 'A',
      light: { primary: '#111111' },
      dark: {},
      createdAt: 1,
      updatedAt: 2,
    });
    expect(overrides).toEqual({ light: { primary: '#111111' }, dark: {} });
  });
});
