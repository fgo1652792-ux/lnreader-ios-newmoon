import * as SecureStore from 'expo-secure-store';

// Zeus parity: TranslationData.AISecretVault — credentials never enter prefs,
// exports, diagnostics or prompts. On iOS this is the Keychain
// (kSecAttrAccessibleWhenUnlockedThisDeviceOnly equivalent); on Android the
// encrypted shared-preferences backed implementation of expo-secure-store.

const SERVICE_PREFIX = 'moon.translation.';

export const readSecret = async (key: string): Promise<string> => {
  try {
    return (await SecureStore.getItemAsync(SERVICE_PREFIX + key)) ?? '';
  } catch {
    return '';
  }
};

export const saveSecret = async (key: string, value: string): Promise<void> => {
  if (value.length === 0) {
    await deleteSecret(key);
    return;
  }
  await SecureStore.setItemAsync(SERVICE_PREFIX + key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
};

export const deleteSecret = async (key: string): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(SERVICE_PREFIX + key);
  } catch {
    // deleting a missing item is fine
  }
};
