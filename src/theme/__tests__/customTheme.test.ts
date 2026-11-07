// Advanced appearance customizer — validation, application, contrast math and
// preset persistence. A corrupted payload must degrade to "no override",
// never crash the theme system.

jest.mock('@utils/mmkv/mmkv', () => {
  const store = new Map<string, string>();
  return {
    MMKVStorage: {
      getString: (k: string) => store.get(k),
      set: (k: string, v: string) => {
        store.set(k, v);
      },
      remove: (k: string) => {
        store.delete(k);
      },
    },
    getMMKVObject: (k: string) => {
      const raw = store.get(k);
      return raw ? JSON.parse(raw) : undefined;
    },
    setMMKVObject: (k: string, v: unknown) => {
      store.set(k, JSON.stringify(v));
    },
  };
});

import { MMKVStorage } from '@utils/mmkv/mmkv';
import {
  applyOverrides,
  contrastRatio,
  deleteCustomThemePreset,
  isReadablePair,
  listSavedCustomThemes,
  loadCustomOverrides,
  resetCustomOverrides,
  sanitizeOverrides,
  saveCustomOverrides,
  saveCustomThemePreset,
} from '../customTheme';
import type { ThemeColors } from '../types';

const baseTheme = {
  id: 100,
  name: 'test',
  isDark: false,
  primary: '#6750A4',
  onPrimary: '#FFFFFF',
  secondary: '#625B71',
  tertiary: '#7D5260',
  error: '#B3261E',
  onError: '#FFFFFF',
  background: '#FEF7FF',
  onBackground: '#1D1B20',
  surface: '#FEF7FF',
  onSurface: '#1D1B20',
  surfaceVariant: '#E7E0EC',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
} as unknown as ThemeColors;

describe('sanitizeOverrides', () => {
  it('keeps only valid hex values on known MD3 tokens', () => {
    expect(
      sanitizeOverrides({
        primary: '#7A5C2E',
        background: 'red',
        onSurface: 'javascript:alert(1)',
        fakeToken: '#ffffff',
      }),
    ).toEqual({ primary: '#7A5C2E' });
  });

  it('accepts short and long hex forms', () => {
    expect(sanitizeOverrides({ primary: '#FFF' })).toEqual({ primary: '#FFF' });
    expect(sanitizeOverrides({ primary: '#FFFEF9' })).toEqual({
      primary: '#FFFEF9',
    });
  });

  it('returns empty for garbage payloads (never throws)', () => {
    expect(sanitizeOverrides(null)).toEqual({});
    expect(sanitizeOverrides('string')).toEqual({});
    expect(sanitizeOverrides(42)).toEqual({});
  });
});

describe('applyOverrides', () => {
  it('overrides tokens and leaves everything else untouched', () => {
    const themed = applyOverrides(baseTheme, { primary: '#123456' });
    expect(themed.primary).toBe('#123456');
    expect(themed.background).toBe(baseTheme.background);
  });

  it('degrades to the base theme when the payload is invalid', () => {
    const themed = applyOverrides(baseTheme, {
      primary: 'not-a-color',
      background: undefined as unknown as string,
    });
    expect(themed).toBe(baseTheme);
  });
});

describe('contrast math', () => {
  it('computes the classic WCAG pairs', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 0);
  });

  it('flags unreadable text pairs below WCAG AA (4.5)', () => {
    expect(isReadablePair('#777777', '#888888')).toBe(false);
    expect(isReadablePair('#1D1B20', '#FEF7FF')).toBe(true);
  });

  it('treats invalid colors as unreadable', () => {
    expect(isReadablePair('oops', '#FFFFFF')).toBe(false);
  });
});

describe('override persistence', () => {
  it('saves, loads and resets per-mode overrides', () => {
    saveCustomOverrides({
      light: { primary: '#111111' },
      dark: { background: '#000000' },
    });
    expect(loadCustomOverrides().light).toEqual({ primary: '#111111' });
    expect(loadCustomOverrides().dark).toEqual({ background: '#000000' });

    resetCustomOverrides('light');
    expect(loadCustomOverrides().light).toEqual({});
    expect(loadCustomOverrides().dark).toEqual({ background: '#000000' });

    resetCustomOverrides();
    expect(loadCustomOverrides()).toEqual({ light: {}, dark: {} });
  });

  it('a corrupted stored payload loads as empty overrides', () => {
    saveCustomOverrides({ light: { primary: 'BAD' }, dark: {} });
    expect(loadCustomOverrides().light).toEqual({});
  });
});

describe('saved theme presets', () => {
  beforeEach(() => {
    MMKVStorage.remove('CUSTOM_THEME_SAVED');
  });

  it('saves named presets and applies them per mode', () => {
    const list = saveCustomThemePreset('ليل القمر', {
      light: {},
      dark: { background: '#050510', primary: '#B8924A' },
    });
    expect(list[0].name).toBe('ليل القمر');
    expect(listSavedCustomThemes()).toHaveLength(1);

    const themed = applyOverrides(
      { ...baseTheme, isDark: true } as ThemeColors,
      list[0].dark,
    );
    expect(themed.background).toBe('#050510');
  });

  it('deletes presets by id', () => {
    const [entry] = saveCustomThemePreset('مؤقت', {
      light: {},
      dark: {},
    });
    const next = deleteCustomThemePreset(entry.id);
    expect(next).toHaveLength(0);
  });

  it('re-saving the same name replaces the old preset', () => {
    saveCustomThemePreset('ثيم', { light: { primary: '#111111' }, dark: {} });
    saveCustomThemePreset('ثيم', { light: { primary: '#222222' }, dark: {} });
    const list = listSavedCustomThemes();
    expect(list).toHaveLength(1);
    expect(list[0].light.primary).toBe('#222222');
  });
});
