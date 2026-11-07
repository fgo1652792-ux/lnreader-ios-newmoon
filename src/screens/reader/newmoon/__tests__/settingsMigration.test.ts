// One-time legacy → New Moon settings migration: every value is type-checked
// and clamped. Corrupted or foreign payloads must produce an EMPTY patch (or
// a clamped one) — never a poisoned New Moon store.

import {
  mapLegacyToWorSettings,
  type LegacyReaderSettingsLike,
} from '../settingsMigration';

jest.mock('@utils/mmkv/mmkv', () => ({
  MMKVStorage: { getString: jest.fn(), set: jest.fn(), remove: jest.fn() },
  getMMKVObject: jest.fn(),
  setMMKVObject: jest.fn(),
}));

// NewMoonAdapter imports the DB chain — stub it (native op-sqlite absent).
jest.mock('@database/db', () => ({ __esModule: true, dbManager: {} }));
jest.mock('@database/manager/manager', () => ({
  __esModule: true,
  castInt: (v: unknown) => v,
}));
jest.mock('@services/plugin/fetch', () => ({
  __esModule: true,
  fetchPage: jest.fn(),
  fetchChapter: jest.fn(),
}));

jest.mock('@hooks/persisted/useSettings', () => ({
  CHAPTER_READER_SETTINGS: 'CHAPTER_READER_SETTINGS',
  initialChapterReaderSettings: {},
}));

jest.mock('../../../../reader/newmoon/worShell', () => ({
  WOR_BG_PRESETS: [
    { value: 'black', name: 'أسود', bg: '#000000', text: '#ffffff' },
    { value: 'charcoal', name: 'فحمي', bg: '#232323', text: '#f3f3f3' },
  ],
  WOR_FONTS: [],
}));

jest.mock('../../../../reader/newmoon/worFonts', () => ({
  WOR_FONTS: [
    { value: 'default', name: 'الخط العادي', family: 'inherit' },
    { value: 'cairo', name: 'خط كايرو', family: 'Cairo, Tahoma, Arial' },
    { value: 'amiri', name: 'خط أميري', family: 'Amiri, Georgia, serif' },
  ],
}));

describe('mapLegacyToWorSettings', () => {
  it('returns an empty patch for null/undefined/non-object payloads', () => {
    expect(mapLegacyToWorSettings(null)).toEqual({});
    expect(mapLegacyToWorSettings(undefined)).toEqual({});
    expect(mapLegacyToWorSettings('garbage' as unknown as LegacyReaderSettingsLike)).toEqual({});
  });

  it('maps numbers and clamps them into the engine range', () => {
    const patch = mapLegacyToWorSettings({
      textSize: 999,
      lineHeight: 0,
    });
    expect(patch.fontSize).toBe(32); // clamped
    expect(patch.lineHeight).toBe(1); // clamped
  });

  it('ignores non-numeric sizes instead of guessing', () => {
    expect(mapLegacyToWorSettings({ textSize: '١٨', lineHeight: null })).toEqual({});
  });

  it('maps text directions to engine directions', () => {
    expect(mapLegacyToWorSettings({ textAlign: 'right' }).direction).toBe('rtl');
    expect(mapLegacyToWorSettings({ textAlign: 'left' }).direction).toBe('ltr');
    expect(mapLegacyToWorSettings({ textAlign: 'center' }).direction).toBe('center');
    expect(mapLegacyToWorSettings({ textAlign: 'justify' }).direction).toBeUndefined();
  });

  it('matches legacy font families against the bundled list', () => {
    expect(mapLegacyToWorSettings({ fontFamily: 'Cairo' }).fontValue).toBe('cairo');
    expect(mapLegacyToWorSettings({ fontFamily: 'خط أميري' }).fontValue).toBe('amiri');
    // Unknown families fall back to the default face — never a broken id.
    expect(mapLegacyToWorSettings({ fontFamily: 'Wingdings' }).fontValue).toBe('default');
  });

  it('matches legacy theme colors to engine presets', () => {
    const patch = mapLegacyToWorSettings({ theme: '#000000', textColor: '#ffffff' });
    expect(patch.bgPreset).toBe('black');
    expect(patch.customColors).toBe(false);
  });

  it('falls back to custom colors when no preset matches', () => {
    const patch = mapLegacyToWorSettings({ theme: '#123456', textColor: '#fedcba' });
    expect(patch.bgColor).toBe('#123456');
    expect(patch.textColor).toBe('#fedcba');
    expect(patch.customColors).toBe(true);
  });

  it('rejects invalid color strings', () => {
    expect(mapLegacyToWorSettings({ theme: 'red', textColor: '#fff' })).toEqual({});
    expect(mapLegacyToWorSettings({ theme: '#12345', textColor: 'javascript:alert(1)' })).toEqual({});
  });
});
