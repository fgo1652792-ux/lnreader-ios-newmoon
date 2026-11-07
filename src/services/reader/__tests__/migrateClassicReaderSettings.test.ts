// migrateClassicReaderSettings — strict per-key validation of the one-time
// classic→wor migration. The native/DB modules NewMoonAdapter pulls in are
// mocked (same pattern as src/screens/reader/newmoon/__tests__), everything
// under test is pure or backed by an in-memory MMKV map.

import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
} from '../../../reader/newmoon/sections';
import { WOR_FONTS } from '../../../reader/newmoon/worFonts';
import { WOR_SETTINGS_KEY, loadWorSettings } from '@screens/reader/newmoon/NewMoonAdapter';
import {
  WOR_LIMITS,
  WOR_SETTINGS_MIGRATION_FLAG,
  ensureClassicMigration,
  migrateClassicToWor,
} from '../migrateClassicReaderSettings';

jest.mock('@database/db', () => ({
  __esModule: true,
  dbManager: {},
}));

jest.mock('@database/manager/manager', () => ({
  __esModule: true,
  castInt: (value: unknown) => value,
}));

jest.mock('@services/plugin/fetch', () => ({
  __esModule: true,
  fetchPage: jest.fn(),
  fetchChapter: jest.fn(),
}));

jest.mock('@database/queries/ChapterQueries', () => ({
  __esModule: true,
  getCustomPages: jest.fn(() => []),
  insertChapters: jest.fn(),
}));

jest.mock('@modules/nitro-tts', () => ({
  __esModule: true,
  TtsEngine: {},
  TtsVoice: {},
}));

jest.mock('react-native-mmkv', () => ({
  __esModule: true,
  useMMKVObject: jest.fn(() => [undefined, jest.fn()]),
  createMMKV: jest.fn(() => ({})),
}));

const mockMmkvMap = new Map<string, string>();

jest.mock('@utils/mmkv/mmkv', () => ({
  __esModule: true,
  MMKVStorage: {
    getString: (key: string) => mockMmkvMap.get(key),
    set: (key: string, value: string) => {
      mockMmkvMap.set(key, value);
    },
    remove: (key: string) => {
      mockMmkvMap.delete(key);
    },
  },
  getMMKVObject: (key: string) => {
    const raw = mockMmkvMap.get(key);
    return raw ? JSON.parse(raw) : undefined;
  },
  setMMKVObject: (key: string, obj: unknown) => {
    mockMmkvMap.set(key, JSON.stringify(obj));
  },
}));

const CHAPTER_READER_SETTINGS = 'CHAPTER_READER_SETTINGS';

const setClassic = (value: unknown) =>
  mockMmkvMap.set(CHAPTER_READER_SETTINGS, JSON.stringify(value));

describe('migrateClassicToWor (pure)', () => {
  it('maps valid classic values onto the base with the applied-key report', () => {
    const { settings, applied } = migrateClassicToWor(
      {
        textSize: 20,
        lineHeight: 1.8,
        theme: '#f3efe7',
        textColor: '#1c1c1c',
        textAlign: 'left',
        fontFamily: 'lora', // not in the WOR font list → skipped
      },
      { ...DEFAULT_SETTINGS },
    );

    expect(settings.fontSize).toBe(20);
    expect(settings.lineHeight).toBe(1.8);
    expect(settings.bgColor).toBe('#f3efe7');
    expect(settings.textColor).toBe('#1c1c1c');
    // #f3efe7 IS the __light__ THEME_CYCLE preset → preset picked, no custom
    expect(settings.bgPreset).toBe('__light__');
    expect(settings.customColors).toBe(false);
    expect(settings.direction).toBe('ltr');
    expect(settings.fontValue).toBe('default');
    expect(applied.sort()).toEqual(
      ['textSize', 'lineHeight', 'theme', 'textColor', 'textAlign'].sort(),
    );
  });

  it('clamps out-of-range numbers to the engine slider ranges', () => {
    const { settings } = migrateClassicToWor(
      { textSize: 99, lineHeight: 0.2 },
      { ...DEFAULT_SETTINGS },
    );
    expect(settings.fontSize).toBe(WOR_LIMITS.fontSize.max);
    expect(settings.lineHeight).toBe(WOR_LIMITS.lineHeight.min);
  });

  it('rejects wrong types instead of writing them (strict validation)', () => {
    const { settings, applied } = migrateClassicToWor(
      {
        textSize: 'twenty',
        lineHeight: Number.NaN,
        theme: 'dark-blue',
        textColor: 12345,
        textAlign: 'diagonal',
      },
      { ...DEFAULT_SETTINGS },
    );
    expect(applied).toEqual([]);
    expect(settings).toEqual({ ...DEFAULT_SETTINGS });
  });

  it('maps a non-preset theme to a custom color, not a preset', () => {
    const { settings } = migrateClassicToWor(
      { theme: '#123456' },
      { ...DEFAULT_SETTINGS },
    );
    expect(settings.bgColor).toBe('#123456');
    expect(settings.bgPreset).toBe(DEFAULT_SETTINGS.bgPreset); // untouched
    expect(settings.customColors).toBe(true);
  });

  it('matches THEME_CYCLE presets case-insensitively', () => {
    const { settings } = migrateClassicToWor(
      { theme: '#000000', textColor: '#FFFFFF' },
      { ...DEFAULT_SETTINGS },
    );
    expect(settings.bgPreset).toBe('black');
    expect(settings.customColors).toBe(false);
  });

  it('maps only whitelisted textAlign values to direction', () => {
    expect(
      migrateClassicToWor({ textAlign: 'right' }, { ...DEFAULT_SETTINGS })
        .settings.direction,
    ).toBe('rtl');
    expect(
      migrateClassicToWor({ textAlign: 'center' }, { ...DEFAULT_SETTINGS })
        .settings.direction,
    ).toBe('center');
    // auto/justify have no WOR equivalent → untouched
    expect(
      migrateClassicToWor({ textAlign: 'auto' }, { ...DEFAULT_SETTINGS })
        .applied,
    ).toEqual([]);
  });

  it('maps fontFamily only when it exists in the WOR font list', () => {
    const known = WOR_FONTS.find(font => font.value !== 'default')!.value;
    const { settings, applied } = migrateClassicToWor(
      { fontFamily: known },
      { ...DEFAULT_SETTINGS },
    );
    expect(applied).toContain('fontFamily');
    expect(settings.fontValue).toBe(known);

    const skipped = migrateClassicToWor(
      { fontFamily: 'OpenDyslexic3-Regular' },
      { ...DEFAULT_SETTINGS },
    );
    expect(skipped.applied).toEqual([]);
    expect(skipped.settings.fontValue).toBe('default');
  });

  it('never migrates replaceText (words belong to the words store)', () => {
    const { settings, applied } = migrateClassicToWor(
      { replaceText: { foo: 'bar' }, removeText: ['x'] },
      { ...DEFAULT_SETTINGS },
    );
    expect(applied).toEqual([]);
    expect(settings).toEqual({ ...DEFAULT_SETTINGS });
  });

  it('survives corrupt input objects and arrays', () => {
    for (const bad of [undefined, null, 42, 'x', []]) {
      const { settings, applied } = migrateClassicToWor(bad, {
        ...DEFAULT_SETTINGS,
      });
      expect(applied).toEqual([]);
      expect(settings).toEqual({ ...DEFAULT_SETTINGS });
    }
  });

  it('preserves base values that the classic settings do not override', () => {
    const base = { ...DEFAULT_SETTINGS, fontSize: 26, dockOpen: false };
    const { settings } = migrateClassicToWor({ textColor: '#abcdef' }, base);
    expect(settings.fontSize).toBe(26);
    expect(settings.dockOpen).toBe(false);
    expect(settings.textColor).toBe('#abcdef');
  });

  it('keeps the result key-complete (every SETTINGS_KEYS key present)', () => {
    const { settings } = migrateClassicToWor(
      { textSize: 21, theme: '#232323' },
      { ...DEFAULT_SETTINGS },
    );
    SETTINGS_KEYS.forEach(key => {
      expect(settings).toHaveProperty(key);
      expect((settings as Record<string, unknown>)[key]).not.toBeUndefined();
    });
  });
});

describe('ensureClassicMigration (one-time, non-clobbering)', () => {
  beforeEach(() => {
    mockMmkvMap.clear();
  });

  it('migrates classic settings onto pristine WOR storage and sets the flag', () => {
    setClassic({ textSize: 24, theme: '#16181d', textColor: '#eef1f6' });

    ensureClassicMigration();

    const settings = loadWorSettings();
    expect(settings.fontSize).toBe(24);
    expect(settings.bgColor).toBe('#16181d');
    expect(settings.textColor).toBe('#eef1f6');
    expect(settings.bgPreset).toBe('soft');
    expect(mockMmkvMap.get(WOR_SETTINGS_MIGRATION_FLAG)).toBe('true');
  });

  it('is idempotent: a second run does not touch WOR settings', () => {
    setClassic({ textSize: 24 });
    ensureClassicMigration();
    const afterFirst = JSON.stringify(loadWorSettings());

    setClassic({ textSize: 34 }); // classic blob changed again — must be ignored
    ensureClassicMigration();

    expect(JSON.stringify(loadWorSettings())).toBe(afterFirst);
    expect(mockMmkvMap.get(WOR_SETTINGS_MIGRATION_FLAG)).toBe('true');
  });

  it('does NOT clobber existing customized WOR settings (skips but flags)', () => {
    // User already customized the new engine before the migration existed.
    mockMmkvMap.set(WOR_SETTINGS_KEY, JSON.stringify({ fontSize: 30 }));
    setClassic({ textSize: 18, theme: '#000000' });

    ensureClassicMigration();

    expect(loadWorSettings().fontSize).toBe(30);
    expect(loadWorSettings().bgColor).toBe(DEFAULT_SETTINGS.bgColor);
    expect(mockMmkvMap.get(WOR_SETTINGS_MIGRATION_FLAG)).toBe('true');
  });

  it('does nothing harmful when no classic settings exist (flag still set)', () => {
    ensureClassicMigration();
    expect(mockMmkvMap.has(WOR_SETTINGS_KEY)).toBe(false);
    expect(mockMmkvMap.get(WOR_SETTINGS_MIGRATION_FLAG)).toBe('true');
    expect(loadWorSettings()).toEqual({ ...DEFAULT_SETTINGS });
  });

  it('treats a corrupt classic blob as nothing to migrate', () => {
    mockMmkvMap.set(CHAPTER_READER_SETTINGS, '{not json');
    ensureClassicMigration();
    expect(mockMmkvMap.has(WOR_SETTINGS_KEY)).toBe(false);
    expect(mockMmkvMap.get(WOR_SETTINGS_MIGRATION_FLAG)).toBe('true');
  });
});
