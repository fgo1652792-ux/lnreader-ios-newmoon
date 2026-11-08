// src/services/translation/secrets.ts
//
// Port of ZEUSNext/TranslationData.swift AISecretVault — provider secrets
// live in the iOS Keychain (kSecAttrAccessibleWhenUnlockedThisDeviceOnly
// semantics) through expo-secure-store. Keys never enter MMKV, JSON files,
// prompts, logs, or WebView-injected JavaScript.
//
// Service namespace mirrors Zeus's per-profile scoping: one fixed service
// for the app install ("moon-novels.translation"), account = provider key
// ('google-cloud' | 'cloudflare-workers-ai' | <provider uuid>).

import * as SecureStore from 'expo-secure-store';

const SERVICE = 'moon-novels.translation';

const scopedKey = (provider: string): string => `${SERVICE}.${provider}`;

export const readSecret = (provider: string): string => {
  if (!provider) return '';
  try {
    return SecureStore.getItem(scopedKey(provider)) ?? '';
  } catch {
    // Keychain unavailable (e.g. simulator edge cases) — treat as unset,
    // never fall back to plaintext storage.
    return '';
  }
};

export const readSecretAsync = async (provider: string): Promise<string> => {
  if (!provider) return '';
  try {
    return (await SecureStore.getItemAsync(scopedKey(provider))) ?? '';
  } catch {
    return '';
  }
};

export const saveSecret = async (
  provider: string,
  value: string,
): Promise<void> => {
  const key = scopedKey(provider);
  if (!provider) {
    throw new Error('اسم مزود غير صالح لحفظ المفتاح.');
  }
  if (!value) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
};

export const removeSecret = async (provider: string): Promise<void> => {
  if (!provider) return;
  await SecureStore.deleteItemAsync(scopedKey(provider));
};
