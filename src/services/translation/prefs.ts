import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import {
  DEFAULT_TRANSLATION_PREFERENCES,
  type TranslationPreferences,
} from './types';
import { createDefaultProvider, type AIProviderConfiguration } from './providerTypes';

// Preference persistence for the translation module. Secrets are NEVER stored
// here — provider API keys/tokens live in SecureStore (secrets.ts). This file
// holds non-secret configuration only, mirroring the Zeus split between
// browser.json (public metadata) and AISecretVault (Keychain).

const PREFS_KEY = '@moon_translation_prefs_v1';
const PROVIDERS_KEY = '@moon_translation_providers_v1';

export const loadPreferences = (): TranslationPreferences => {
  const stored = getMMKVObject<Partial<TranslationPreferences>>(PREFS_KEY);
  return { ...DEFAULT_TRANSLATION_PREFERENCES, ...(stored ?? {}) };
};

export const savePreferences = (prefs: TranslationPreferences): void => {
  setMMKVObject(PREFS_KEY, prefs);
};

export const loadProviders = (): AIProviderConfiguration[] =>
  getMMKVObject<AIProviderConfiguration[]>(PROVIDERS_KEY) ?? [];

export const saveProviders = (providers: AIProviderConfiguration[]): void => {
  setMMKVObject(PROVIDERS_KEY, providers);
};

export const createProvider = createDefaultProvider;

export const providerById = (
  providers: AIProviderConfiguration[],
  id: string | null,
): AIProviderConfiguration | null =>
  id ? (providers.find(provider => provider.id === id) ?? null) : null;
