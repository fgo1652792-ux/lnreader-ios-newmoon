// Search-query translation (Moon novels v3, spec item A).
//
// When the user searches an Arabic novel name, foreign-language sources can
// only answer a translated query. This helper translates a search query into
// a source's language with the user's selected translation engine and is
// INTENTIONALLY additive: callers keep the original results and append the
// translated-query results under a label. A null return (disabled, failed,
// same-language or empty input) always means "just use the original query".

import { languagesMapping } from '@utils/constants/languages';

import { autoEnabled, secretKey } from './types';
import { isAlreadyTargetLanguage } from './metadata';
import { loadPreferences, loadProviders, providerById } from './prefs';
import { readSecret } from './secrets';
import { translateSegments } from './textService';

// Queries containing an Arabic letter are the feature's trigger.
export const ARABIC_QUERY_PATTERN = /[\u0600-\u06FF]/;

// In-memory (text|target) cache — one query per search submit, repeated
// across many plugins per submit, so a small LRU is enough.
const CACHE_LIMIT = 64;
const cache = new Map<string, string | null>();

// Plugin `lang` values are display names from lnreader-plugins ('English',
// 'Español', …), but some repos use BCP-47 tags ('pt-BR'). Unicode directional
// marks (see languagesMapping's '‎العربية') are stripped before comparing.
const DIRECTIONAL_MARKS = /[\u200E\u200F]/g;

const ARABIC_LANG_KEYS = new Set(['ar', 'arabic', 'العربية']);

export const isArabicPluginLang = (lang: string): boolean => {
  const value = (lang ?? '')
    .replace(DIRECTIONAL_MARKS, '')
    .trim()
    .toLowerCase();
  if (!value) return false;
  return ARABIC_LANG_KEYS.has(value) || value.split('-')[0] === 'ar';
};

const langCodeByName = new Map(
  Object.entries(languagesMapping)
    .filter(([code]) => code !== 'ab') // legacy mapping quirk: 'ab' backs the Arabic name
    .map(([code, name]) => [
      name.replace(DIRECTIONAL_MARKS, '').trim().toLowerCase(),
      code,
    ]),
);

// Target language for a source's lang field, or null when the source must be
// skipped (Arabic source — the query is already in its language — or an
// unmappable value like 'Multi').
export const pluginSearchTarget = (lang: string): string | null => {
  const value = (lang ?? '').replace(DIRECTIONAL_MARKS, '').trim();
  if (!value || isArabicPluginLang(value)) return null;
  const byName = langCodeByName.get(value.toLowerCase());
  if (byName) return byName;
  if (/^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(value)) return value;
  return null;
};

export const translateSearchQuery = async (
  text: string,
  target: string,
): Promise<string | null> => {
  const query = text?.trim() ?? '';
  const normalizedTarget = target?.trim() ?? '';
  if (!query || !normalizedTarget) return null;
  // Gate BEFORE the cache: switching the master switch off must immediately
  // behave as if the feature did not exist.
  const prefs = loadPreferences();
  if (!autoEnabled('metadata', prefs)) return null;
  const cacheKey = `${normalizedTarget}|${query}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }
  try {
    if (isAlreadyTargetLanguage(query, normalizedTarget)) return null;
    const provider =
      prefs.engine === 'ai'
        ? providerById(loadProviders(), prefs.providerID)
        : null;
    const secret = await readSecret(secretKey(prefs, provider));
    // translateSegments reads the destination language from prefs.target;
    // override it so the query goes to the SOURCE's language, not the
    // user's display target.
    const translated = await translateSegments([{ id: 'q', text: query }], {
      prefs: { ...prefs, target: normalizedTarget },
      provider,
      secret,
    });
    const value = translated[0]?.text?.trim() ?? '';
    const result = value.length > 0 ? value : null;
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next();
      if (oldest.done !== true) cache.delete(oldest.value);
    }
    cache.set(cacheKey, result);
    return result;
  } catch {
    // Never throw into the search flow: a failed translation simply means
    // the caller shows the original results only.
    return null;
  }
};
