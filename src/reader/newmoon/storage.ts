// lnreader-ios/src/reader/newmoon/storage.ts
// MMKV-backed shim replicating New-moon-2/src/reader/storage.ts (1:1 API).
//
// The copied engine modules (wordsStore.js) import { storage } from './storage'
// and use the async getItem/setItem/removeItem surface. The web engine backed
// it with localStorage; here it is MMKV (react-native-mmkv is already the
// app-wide KV store), JSON-encoded by the callers themselves — this shim stores
// the raw string values it is given, exactly like localStorage did. A memory
// Map covers the (theoretical) case of MMKV throwing during early startup.

import { MMKVStorage } from '@utils/mmkv/mmkv';

const memory = new Map<string, string>();

export const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return MMKVStorage.getString(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      MMKVStorage.set(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      MMKVStorage.remove(key);
    } catch {
      // ignore
    }
    memory.delete(key);
  },
};
