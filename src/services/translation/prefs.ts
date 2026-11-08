// src/services/translation/prefs.ts
//
// Translation preferences, provider configurations and the per-novel glossary
// (Zeus kept TranslationPreferences + AIProviderConfiguration in browser
// settings; Moon novels keeps its own MMKV-backed stores with per-novel
// overrides, matching the app's existing settings patterns).
//
// Glossary terms are injected into AI translation instructions ONLY — they
// never touch the reader's word-replacement/colouring store (wordsStore), so
// the two systems cannot fight over the same text (explicit requirement).

import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import {
  AIProviderConfiguration,
  CloudflareTranslationConfiguration,
  TranslationPreferences,
  defaultTranslationPreferences,
  newCloudflareConfiguration,
} from './types';

const PREFS_KEY = '@moon_translation_prefs';
const PROVIDERS_KEY = '@moon_translation_providers';
const CLOUDFLARE_KEY = '@moon_translation_cloudflare';
const GLOSSARY_GLOBAL_KEY = '@moon_translation_glossary_global';
const glossaryNovelKey = (novelId: number) =>
  `@moon_translation_glossary_novel_${novelId}`;
const overrideKey = (novelId: number) =>
  `@moon_translation_override_${novelId}`;

export type GlossaryItem = {
  id: string;
  term: string;
  translation: string;
  note?: string;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Type-checked preferences load — corrupted values fall back to defaults. */
export const loadTranslationPrefs = (): TranslationPreferences => {
  const raw = getMMKVObject<Record<string, unknown>>(PREFS_KEY);
  const base = defaultTranslationPreferences();
  if (!isPlainObject(raw)) return base;
  const merged: TranslationPreferences = { ...base };
  if (typeof raw.engine === 'string' && raw.engine.length)
    {merged.engine = raw.engine as TranslationPreferences['engine'];}
  if (typeof raw.target === 'string' && raw.target) merged.target = raw.target;
  if (typeof raw.suggest === 'boolean') merged.suggest = raw.suggest;
  if (typeof raw.automatic === 'boolean') merged.automatic = raw.automatic;
  if (typeof raw.dynamicContent === 'boolean')
    {merged.dynamicContent = raw.dynamicContent;}
  if (Array.isArray(raw.excludedHosts)) {
    merged.excludedHosts = raw.excludedHosts.filter(
      (h): h is string => typeof h === 'string',
    );
  }
  if (typeof raw.providerID === 'string') merged.providerID = raw.providerID;
  if (
    typeof raw.retainTranslations === 'boolean' ||
    raw.retainTranslations === null
  ) {
    merged.retainTranslations = raw.retainTranslations;
  }
  if (
    typeof raw.suggestionDuration === 'number' ||
    raw.suggestionDuration === null
  ) {
    merged.suggestionDuration = raw.suggestionDuration;
  }
  if (typeof raw.preloadNext === 'number' && raw.preloadNext >= 0) {
    merged.preloadNext = Math.min(2, Math.floor(raw.preloadNext));
  }
  if (isPlainObject(raw.cloudflare)) {
    const cf = raw.cloudflare as Record<string, unknown>;
    const config = newCloudflareConfiguration();
    if (typeof cf.endpoint === 'string' && cf.endpoint)
      {config.endpoint = cf.endpoint;}
    if (typeof cf.accountID === 'string') config.accountID = cf.accountID;
    if (typeof cf.accountName === 'string') config.accountName = cf.accountName;
    if (typeof cf.model === 'string' && cf.model) config.model = cf.model;
    if (typeof cf.instruction === 'string') config.instruction = cf.instruction;
    merged.cloudflare = config;
  }
  return merged;
};

export const saveTranslationPrefs = (prefs: TranslationPreferences): void => {
  setMMKVObject(PREFS_KEY, prefs);
};

/** Optional per-novel preferences (partial override of the global ones). */
export const loadNovelOverride = (
  novelId: number,
): Partial<TranslationPreferences> | null => {
  const raw = getMMKVObject<Partial<TranslationPreferences>>(
    overrideKey(novelId),
  );
  return raw && typeof raw === 'object' ? raw : null;
};

export const saveNovelOverride = (
  novelId: number,
  override: Partial<TranslationPreferences> | null,
): void => {
  if (!override || !Object.keys(override).length) {
    // MMKV has no delete in the shared helper — overwrite with empty object.
    setMMKVObject(overrideKey(novelId), {});
    return;
  }
  setMMKVObject(overrideKey(novelId), override);
};

/** Effective preferences for a novel: global + override. */
export const effectivePrefs = (novelId?: number): TranslationPreferences => {
  const global = loadTranslationPrefs();
  if (!novelId) return global;
  const override = loadNovelOverride(novelId);
  if (!override) return global;
  return { ...global, ...override };
};

export const loadProviders = (): AIProviderConfiguration[] =>
  getMMKVObject<AIProviderConfiguration[]>(PROVIDERS_KEY) ?? [];

export const saveProviders = (providers: AIProviderConfiguration[]): void => {
  setMMKVObject(PROVIDERS_KEY, providers);
};

export const providerById = (id?: string): AIProviderConfiguration | null =>
  id ? loadProviders().find(p => p.id === id) ?? null : null;

export const loadCloudflareConfig = (): CloudflareTranslationConfiguration =>
  getMMKVObject<CloudflareTranslationConfiguration>(CLOUDFLARE_KEY) ??
  newCloudflareConfiguration();

export const saveCloudflareConfig = (
  config: CloudflareTranslationConfiguration,
): void => {
  setMMKVObject(CLOUDFLARE_KEY, config);
};

// -------------------------------------------------------------- glossary --

const isGlossaryList = (value: unknown): value is GlossaryItem[] =>
  Array.isArray(value) &&
  value.every(
    item =>
      isPlainObject(item) &&
      typeof item.id === 'string' &&
      typeof item.term === 'string' &&
      typeof item.translation === 'string',
  );

export const loadGlossary = (novelId?: number): GlossaryItem[] => {
  const raw = getMMKVObject<unknown>(
    novelId ? glossaryNovelKey(novelId) : GLOSSARY_GLOBAL_KEY,
  );
  return isGlossaryList(raw) ? raw : [];
};

export const saveGlossary = (items: GlossaryItem[], novelId?: number): void => {
  setMMKVObject(
    novelId ? glossaryNovelKey(novelId) : GLOSSARY_GLOBAL_KEY,
    items,
  );
};

/**
 * Compose the AI instruction block: user style + glossary (bounded). Engines
 * without instruction support never see this (checked by the caller).
 */
export const composeInstruction = (
  providerInstruction: string,
  novelId?: number,
  glossaryLimit = 120,
): string => {
  const parts: string[] = [];
  if (providerInstruction.trim()) parts.push(providerInstruction.trim());
  const globalItems = loadGlossary();
  const novelItems = novelId ? loadGlossary(novelId) : [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const item of [...globalItems, ...novelItems]) {
    const term = item.term.trim();
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    terms.push(`${term} = ${item.translation.trim()}`);
    if (terms.length >= glossaryLimit) break;
  }
  if (terms.length) {
    parts.push(
      'Glossary (use these exact renderings):\n' +
        terms.map(t => `- ${t}`).join('\n'),
    );
  }
  return parts.join('\n\n');
};
