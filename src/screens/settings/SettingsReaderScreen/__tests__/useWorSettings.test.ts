// useWorSettings — patch logic: merge over the snapshot, persist through
// saveWorSettingsPatch, flag structural rebuilds before the merge (engine
// parity with NewMoonReaderScreen.applySettingsPatch).

import { act, renderHook } from '@testing-library/react-native';
import { DEFAULT_SETTINGS } from '../../../../reader/newmoon/sections';
import { WOR_SETTINGS_KEY } from '../../../reader/newmoon/NewMoonAdapter';
import { useWorSettings } from '../useWorSettings';

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

describe('useWorSettings', () => {
  beforeEach(() => {
    mockMmkvMap.clear();
  });

  it('starts from loadWorSettings() (defaults when storage is empty)', () => {
    const { result } = renderHook(() => useWorSettings());
    expect(result.current.settings).toEqual({ ...DEFAULT_SETTINGS });
    expect(result.current.lastPatchNeedsRebuild).toBe(false);
  });

  it('patch() merges into state and persists the partial patch to MMKV', () => {
    const { result } = renderHook(() => useWorSettings());

    act(() => {
      result.current.patch({ fontSize: 26 });
    });

    expect(result.current.settings.fontSize).toBe(26);
    expect(result.current.settings.lineHeight).toBe(DEFAULT_SETTINGS.lineHeight);
    expect(JSON.parse(mockMmkvMap.get(WOR_SETTINGS_KEY)!)).toEqual({
      fontSize: 26,
    });
  });

  it('consecutive patches accumulate (state mirror + storage)', () => {
    const { result } = renderHook(() => useWorSettings());

    act(() => {
      result.current.patch({ fontSize: 22 });
      result.current.patch({ continuousMode: true });
    });

    expect(result.current.settings.fontSize).toBe(22);
    expect(result.current.settings.continuousMode).toBe(true);
    expect(JSON.parse(mockMmkvMap.get(WOR_SETTINGS_KEY)!)).toEqual({
      fontSize: 22,
      continuousMode: true,
    });
  });

  it('flags a structural rebuild when a structural key actually changes', () => {
    const { result } = renderHook(() => useWorSettings());

    act(() => {
      result.current.patch({ selectedQuoteStyle: 'curly' });
    });
    expect(result.current.lastPatchNeedsRebuild).toBe(true);

    act(() => {
      result.current.patch({ selectedQuoteStyle: 'curly' }); // same value
    });
    expect(result.current.lastPatchNeedsRebuild).toBe(false);

    act(() => {
      result.current.patch({ customOpenMark: '«' });
    });
    expect(result.current.lastPatchNeedsRebuild).toBe(true);

    act(() => {
      result.current.patch({ fontSize: 30 }); // non-structural
    });
    expect(result.current.lastPatchNeedsRebuild).toBe(false);
  });

  it('re-reads user-modified MMKV values on mount', () => {
    mockMmkvMap.set(WOR_SETTINGS_KEY, JSON.stringify({ fontSize: 31 }));
    const { result } = renderHook(() => useWorSettings());
    expect(result.current.settings.fontSize).toBe(31);
    expect(result.current.settings.textColor).toBe(DEFAULT_SETTINGS.textColor);
  });
});
