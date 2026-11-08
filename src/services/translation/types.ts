import type { AIProviderConfiguration, CloudflareTranslationConfiguration } from './providerTypes';

// Ported from Zeus Ascent Edition: ZEUSNext/TranslationData.swift (branch
// edition/ascent-parity-20261101, commit 71023ca). Engine enum, preferences and
// languages are 1:1 ports; browser-profile fields were dropped because Moon
// novels has no Zeus profile system.

export type TranslationEngine =
  | 'googleWeb'
  | 'googleCloud'
  | 'ai'
  | 'cloudflare'
  | 'microsoftVisco';

export const TRANSLATION_ENGINES: { id: TranslationEngine; title: string }[] = [
  { id: 'googleWeb', title: 'Google Translate — خدمة الويب' },
  { id: 'googleCloud', title: 'Google Cloud Translation — رسمي' },
  { id: 'ai', title: 'الذكاء الاصطناعي' },
  { id: 'cloudflare', title: 'Cloudflare Workers AI' },
  { id: 'microsoftVisco', title: 'Microsoft Translator — عبر Visco' },
];

// Verbatim from TranslationData.swift line 30.
export const TRANSLATION_LANGUAGES: [string, string][] = [
  ['ar', 'العربية'],
  ['en', 'English'],
  ['fr', 'Français'],
  ['es', 'Español'],
  ['de', 'Deutsch'],
  ['tr', 'Türkçe'],
  ['fa', 'فارسی'],
  ['ur', 'اردو'],
  ['he', 'עברית'],
  ['ru', 'Русский'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['zh-CN', '中文'],
  ['pt', 'Português'],
  ['it', 'Italiano'],
  ['id', 'Indonesia'],
];

// Swift wrote contains(_:) on Array; JS equivalent is includes().
export const isRTLLanguage = (language: string): boolean =>
  ['ar', 'fa', 'ur', 'he', 'ps', 'yi'].includes(language.split('-')[0]);

export interface TranslationSegment {
  id: string;
  text: string;
}

// Failure carries an already-localized Arabic message, mirroring
// TranslationFailure.message in Swift.
export class TranslationFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationFailure';
  }
}

// Moon novels additions (reader-facing, no Zeus equivalent needed there):
// readerAutomatic / prefetchNextChapters / glossary / customInstruction.
export interface TranslationPreferences {
  engine: TranslationEngine;
  target: string;
  suggest: boolean;
  automatic: boolean;
  dynamicContent: boolean;
  excludedHosts: string[];
  providerID: string | null;
  cloudflare: CloudflareTranslationConfiguration | null;
  retainTranslations: boolean | null;
  suggestionDuration: number | null;
  readerAutomatic: boolean;
  prefetchNextChapters: number; // 0 = off, 1..2 chapters pre-translated
  glossary: { term: string; replacement: string }[];
  customInstruction: string;
}

export const DEFAULT_TRANSLATION_PREFERENCES: TranslationPreferences = {
  engine: 'googleWeb',
  target: 'ar',
  suggest: true,
  automatic: false,
  dynamicContent: true,
  excludedHosts: [],
  providerID: null,
  cloudflare: null,
  retainTranslations: null,
  suggestionDuration: null,
  readerAutomatic: false,
  prefetchNextChapters: 0,
  glossary: [],
  customInstruction: '',
};

export const suggestionSeconds = (prefs: TranslationPreferences): number =>
  Math.min(30, Math.max(0, prefs.suggestionDuration ?? 1.5));

export const keepsTranslations = (prefs: TranslationPreferences): boolean =>
  prefs.retainTranslations ?? true;

export const usesAIBatches = (prefs: TranslationPreferences): boolean =>
  prefs.engine === 'ai' || prefs.engine === 'cloudflare';

export const streamsLargeBatches = (
  prefs: TranslationPreferences,
  provider: AIProviderConfiguration | null,
): boolean => prefs.engine === 'ai' && provider?.kind === 'openAICompatible';

export const secretKey = (
  prefs: TranslationPreferences,
  provider: AIProviderConfiguration | null,
): string => {
  switch (prefs.engine) {
    case 'microsoftVisco':
      return '';
    case 'googleCloud':
      return 'google-cloud';
    case 'cloudflare':
      return 'cloudflare-workers-ai';
    default:
      return provider?.id ?? '';
  }
};

// Memory namespace identity (see memory.ts): same fields as Zeus
// TranslationMemory.identity. Never includes secrets.
export const memoryIdentity = (
  pageID: string,
  prefs: TranslationPreferences,
  provider: AIProviderConfiguration | null,
): string[] => {
  const identity: string[] = ['v2', pageID, prefs.engine, prefs.target];
  if (prefs.engine === 'ai') {
    identity.push(
      provider?.id ?? '',
      provider?.baseURL ?? '',
      provider?.model ?? '',
      provider?.instruction ?? '',
      provider?.projectID ?? '',
      provider?.conversationID ?? '',
    );
  }
  if (prefs.engine === 'cloudflare') {
    identity.push(
      prefs.cloudflare?.endpoint ?? '',
      prefs.cloudflare?.accountID ?? '',
      prefs.cloudflare?.model ?? '',
      prefs.cloudflare?.instruction ?? '',
    );
  }
  return identity;
};
