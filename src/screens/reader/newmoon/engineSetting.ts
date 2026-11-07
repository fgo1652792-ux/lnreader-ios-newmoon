// lnreader-ios/src/screens/reader/newmoon/engineSetting.ts
//
// Reader-engine switch ('wor' = the New-moon-2 engine, 'classic' = the
// original LNReader WebView reader). Kept in its own MMKV key under the
// newmoon folder's ownership; default 'wor'.

import { MMKVStorage } from '@utils/mmkv/mmkv';

export const READER_ENGINE_KEY = '@reader_engine_v1';

export type ReaderEngine = 'wor' | 'classic';

export const getReaderEngine = (): ReaderEngine => {
  const value = MMKVStorage.getString(READER_ENGINE_KEY);
  return value === 'classic' ? 'classic' : 'wor';
};

export const setReaderEngine = (engine: ReaderEngine): void => {
  MMKVStorage.set(READER_ENGINE_KEY, engine);
};
