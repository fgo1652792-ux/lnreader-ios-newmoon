// Regression: the release-2.1.4 FunctionCallException crash.
//
//   FunctionCallException: Calling the 'setActive' function has failed.
//   The 1st argument cannot be cast to type Bool. Conversion from JavaScript
//   value of type 'undefined' to native 'Bool' failed.
//
// Root cause: useChapterGeneralSettings did NOT merge `initialChapterGeneralSettings`
// with the stored MMKV object (unlike useChapterReaderSettings). Settings persisted
// by an older app version lack the keys added since — `useVolumeButtons` surfaced
// as `undefined` and reached NativeVolumeButtonListener.setActive(Bool).
// The fix overlays the defaults on every read; these tests pin the contract.

import { renderHook } from '@testing-library/react-native';

const mockUseMMKVObject = jest.fn();

jest.mock('react-native-mmkv', () => ({
  useMMKVObject: (...args: unknown[]) => mockUseMMKVObject(...args),
}));

jest.mock('@utils/mmkv/mmkv', () => ({
  MMKVStorage: {
    getString: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
  getMMKVObject: jest.fn(),
  setMMKVObject: jest.fn(),
}));

import { useChapterGeneralSettings } from '../useSettings';

const settingsKey = 'CHAPTER_GENERAL_SETTINGS';

describe('useChapterGeneralSettings — stale-persisted-object safety', () => {
  it('fills keys missing from an old persisted object with defaults (useVolumeButtons is never undefined)', () => {
    // Object written by an older app version: only the keys that existed then.
    const staleStored = { theme: '#292832', pageReader: true };
    mockUseMMKVObject.mockReturnValue([staleStored, jest.fn()]);

    const { result } = renderHook(() => useChapterGeneralSettings());

    expect(result.current.useVolumeButtons).toBe(false);
    expect(result.current.TTSEnable).toBe(true);
    expect(result.current.autoScroll).toBe(false);
    expect(result.current.verticalSeekbar).toBe(true);
    expect(result.current.volumeButtonsOffset).toBeNull();
    // Stored values still win over defaults
    expect(result.current.pageReader).toBe(true);
  });

  it('returns booleans (never undefined) for every native-facing field when storage is empty', () => {
    mockUseMMKVObject.mockReturnValue([undefined, jest.fn()]);

    const { result } = renderHook(() => useChapterGeneralSettings());

    const nativeFacing: (keyof ReturnType<typeof useChapterGeneralSettings>)[] =
      [
        'useVolumeButtons',
        'keepScreenOn',
        'fullScreenMode',
        'pageReader',
        'swipeGestures',
        'pageReaderInvertVolumeButtons',
        'pageReaderDisableAnimation',
        'bionicReading',
        'tapToScroll',
      ];
    nativeFacing.forEach(key => {
      expect(typeof result.current[key]).toBe('boolean');
    });
  });

  it('uses the same storage key and the writer merges partial patches', () => {
    const setter = jest.fn();
    mockUseMMKVObject.mockImplementation((key: string) => {
      expect(key).toBe(settingsKey);
      return [undefined, setter];
    });

    const { result } = renderHook(() => useChapterGeneralSettings());
    result.current.setChapterGeneralSettings({ useVolumeButtons: true });

    expect(setter).toHaveBeenCalledWith(
      expect.objectContaining({ useVolumeButtons: true }),
    );
  });

  it('survives a corrupted (null) stored object', () => {
    mockUseMMKVObject.mockReturnValue([null, jest.fn()]);

    const { result } = renderHook(() => useChapterGeneralSettings());
    expect(result.current.useVolumeButtons).toBe(false);
  });
});
