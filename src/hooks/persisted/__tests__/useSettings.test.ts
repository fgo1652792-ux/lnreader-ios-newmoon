// useSettings — hydration must NEVER surface undefined fields from a stored
// PARTIAL object, and every write must persist a COMPLETE object. This is the
// regression test for the v2.1.4 `setActive` native crash: a partial
// CHAPTER_GENERAL_SETTINGS blob made `useVolumeButtons` read back as
// `undefined`, which the native Bool conversion rejected.

import { renderHook, act } from '@testing-library/react-native';
import {
  APP_SETTINGS,
  BROWSE_SETTINGS,
  CHAPTER_GENERAL_SETTINGS,
  CHAPTER_READER_SETTINGS,
  LIBRARY_SETTINGS,
  initialChapterGeneralSettings,
  useAppSettings,
  useBrowseSettings,
  useChapterGeneralSettings,
  useChapterReaderSettings,
  useLibrarySettings,
} from '../useSettings';

const mockMmkv = new Map<string, string>();

jest.mock('react-native-mmkv', () => {
  const React = require('react');
  return {
    __esModule: true,
    useMMKVObject: (key: string) => {
      const [value, setValue] = React.useState(() => {
        const raw = mockMmkv.get(key);
        return raw ? JSON.parse(raw) : undefined;
      });
      const setter = (updater: any) => {
        setValue((previous: any) => {
          const next =
            typeof updater === 'function' ? updater(previous) : updater;
          if (next === undefined) {
            mockMmkv.delete(key);
          } else {
            mockMmkv.set(key, JSON.stringify(next));
          }
          return next;
        });
      };
      return [value, setter];
    },
    createMMKV: jest.fn(() => ({})),
  };
});

jest.mock('@utils/mmkv/mmkv', () => ({
  __esModule: true,
  MMKVStorage: {
    getString: (key: string) => mockMmkv.get(key),
    set: (key: string, value: string) => {
      mockMmkv.set(key, value);
    },
    remove: (key: string) => {
      mockMmkv.delete(key);
    },
  },
  getMMKVObject: (key: string) => {
    const raw = mockMmkv.get(key);
    return raw ? JSON.parse(raw) : undefined;
  },
  setMMKVObject: (key: string, obj: unknown) => {
    mockMmkv.set(key, JSON.stringify(obj));
  },
}));

jest.mock('@modules/nitro-tts', () => ({
  __esModule: true,
  TtsEngine: {},
  TtsVoice: {},
}));

const seed = (key: string, value: unknown) =>
  mockMmkv.set(key, JSON.stringify(value));

beforeEach(() => {
  mockMmkv.clear();
});

describe('useChapterGeneralSettings (the crash path)', () => {
  it('fills a stored PARTIAL object with defaults (no undefined fields)', () => {
    // Pre-fix writer output: `{ autoScroll: true }` alone in MMKV.
    seed(CHAPTER_GENERAL_SETTINGS, { autoScroll: true });

    const { result } = renderHook(() => useChapterGeneralSettings());

    expect(result.current.autoScroll).toBe(true);
    // The exact crash: useVolumeButtons must be a real boolean, never undefined
    expect(result.current.useVolumeButtons).toBe(false);
    (Object.keys(initialChapterGeneralSettings) as (keyof typeof initialChapterGeneralSettings)[]).forEach(
      key => {
        expect(result.current[key]).not.toBeUndefined();
      },
    );
  });

  it('persists a COMPLETE object on the first write to an empty store', () => {
    const { result } = renderHook(() => useChapterGeneralSettings());

    act(() => {
      result.current.setChapterGeneralSettings({ useVolumeButtons: true });
    });

    const stored = JSON.parse(mockMmkv.get(CHAPTER_GENERAL_SETTINGS)!);
    expect(stored.useVolumeButtons).toBe(true);
    // Every default key is present — a later reader can never read undefined.
    Object.keys(initialChapterGeneralSettings).forEach(key => {
      expect(stored).toHaveProperty(key);
      expect(stored[key]).not.toBeUndefined();
    });
  });

  it('fills a PARTIAL stored object on write (completes the blob)', () => {
    seed(CHAPTER_GENERAL_SETTINGS, { autoScroll: true });

    const { result } = renderHook(() => useChapterGeneralSettings());
    act(() => {
      result.current.setChapterGeneralSettings({ useVolumeButtons: true });
    });

    const stored = JSON.parse(mockMmkv.get(CHAPTER_GENERAL_SETTINGS)!);
    expect(stored.autoScroll).toBe(true);
    expect(stored.useVolumeButtons).toBe(true);
    expect(stored.tapToScroll).toBe(false);
  });

  it('keeps sequential writes from clobbering each other', () => {
    const { result } = renderHook(() => useChapterGeneralSettings());

    act(() => {
      result.current.setChapterGeneralSettings({ autoScroll: true });
      result.current.setChapterGeneralSettings({ bionicReading: true });
    });

    const stored = JSON.parse(mockMmkv.get(CHAPTER_GENERAL_SETTINGS)!);
    expect(stored.autoScroll).toBe(true);
    expect(stored.bionicReading).toBe(true);
  });
});

describe('remaining settings domains', () => {
  it('useAppSettings merges a stored partial object', () => {
    seed(APP_SETTINGS, { incognitoMode: true });
    const { result } = renderHook(() => useAppSettings());

    expect(result.current.incognitoMode).toBe(true);
    expect(result.current.timeTrackingEnabled).toBe(true);
    expect(result.current.inactivityTimeoutMs).toBe(5 * 60 * 1000);
  });

  it('useBrowseSettings merges a stored partial object', () => {
    seed(BROWSE_SETTINGS, { showMyAnimeList: false });
    const { result } = renderHook(() => useBrowseSettings());

    expect(result.current.showMyAnimeList).toBe(false);
    expect(result.current.showAniList).toBe(true);
    expect(result.current.globalSearchConcurrency).toBe(3);
  });

  it('useLibrarySettings merges a stored partial object', () => {
    seed(LIBRARY_SETTINGS, { displayMode: 'compact' });
    const { result } = renderHook(() => useLibrarySettings());

    expect(result.current.displayMode).toBe('compact');
    expect(result.current.novelsPerRow).toBe(3);
    expect(result.current.showDownloadBadges).toBe(true);
  });

  it('useChapterReaderSettings merges a stored partial object (incl. tts)', () => {
    seed(CHAPTER_READER_SETTINGS, { textSizeBogus: 'kept', theme: '#101010' });
    const { result } = renderHook(() => useChapterReaderSettings());

    expect(result.current.theme).toBe('#101010');
    expect(result.current.textSize).toBe(16);
    expect(result.current.tts.rate).toBe(1);
    expect(result.current.tts.scrollToTop).toBe(true);
  });
});
