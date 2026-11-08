// src/services/translation/types.ts
//
// Port of ZEUSNext/TranslationData.swift (Zeus-Ascent-Edition,
// branch edition/ascent-parity-20261101, commit 71023ca) — the shared
// vocabulary of the translation engine: engines, preferences, provider
// configurations, segments and failures.
//
// Port edits vs the Swift source (everything else is a 1:1 mapping):
//   • AISecretVault (iOS Keychain) moved to ./secrets.ts so this file stays
//     type-only (Swift stored it beside the types; RN needs a module with a
//     native dependency, and importing it from tests must not require it).
//   • UUID() → uuid() from ./uuid (RFC 4122 v4).
//   • TranslationPreferences.languages / rtl() kept verbatim.

import { uuid } from './uuid';

export type TranslationSegment = { id: string; text: string };

export enum TranslationEngine {
  googleWeb = 'googleWeb',
  googleCloud = 'googleCloud',
  ai = 'ai',
  cloudflare = 'cloudflare',
  microsoftVisco = 'microsoftVisco',
}

export const TRANSLATION_ENGINES: TranslationEngine[] = [
  TranslationEngine.googleWeb,
  TranslationEngine.googleCloud,
  TranslationEngine.ai,
  TranslationEngine.cloudflare,
  TranslationEngine.microsoftVisco,
];

export const engineTitle = (engine: TranslationEngine): string => {
  switch (engine) {
    case TranslationEngine.googleWeb:
      return 'Google Translate — خدمة الويب';
    case TranslationEngine.googleCloud:
      return 'Google Cloud Translation — رسمي';
    case TranslationEngine.ai:
      return 'الذكاء الاصطناعي';
    case TranslationEngine.cloudflare:
      return 'Cloudflare Workers AI';
    case TranslationEngine.microsoftVisco:
      return 'Microsoft Translator — عبر Visco';
  }
};

export type AIProviderKindValue =
  | 'chatGPTAccount'
  | 'geminiAccount'
  | 'openAICompatible'
  | 'geminiAPI';

export enum AIProviderKind {
  chatGPTAccount = 'chatGPTAccount',
  geminiAccount = 'geminiAccount',
  openAICompatible = 'openAICompatible',
  geminiAPI = 'geminiAPI',
}

export const AI_PROVIDER_KINDS: AIProviderKind[] = [
  AIProviderKind.openAICompatible,
  AIProviderKind.geminiAPI,
  AIProviderKind.chatGPTAccount,
  AIProviderKind.geminiAccount,
];

export const providerKindTitle = (kind: AIProviderKind): string => {
  switch (kind) {
    case AIProviderKind.chatGPTAccount:
      return 'حساب ChatGPT';
    case AIProviderKind.geminiAccount:
      return 'حساب Gemini';
    case AIProviderKind.openAICompatible:
      return 'OpenAI / مزود متوافق';
    case AIProviderKind.geminiAPI:
      return 'Gemini API الرسمي';
  }
};

export const isAccountKind = (kind: AIProviderKind): boolean =>
  kind === AIProviderKind.chatGPTAccount ||
  kind === AIProviderKind.geminiAccount;

export type AIChoice = { id: string; name: string; metadata?: string };
export type AIProject = {
  id: string;
  name: string;
  chats: AIChoice[];
};

export type AIProviderConfiguration = {
  id: string;
  name: string;
  kind: AIProviderKind;
  baseURL: string;
  model: string;
  models: AIChoice[];
  chats: AIChoice[];
  projects: AIProject[];
  projectID?: string;
  conversationID?: string;
  googleAccountIndex: number;
  instruction: string;
  lastChecked?: number;
  discoveryNotice?: string;
};

export const newProviderConfiguration = (
  kind: AIProviderKind = AIProviderKind.openAICompatible,
): AIProviderConfiguration => ({
  id: uuid(),
  name: '',
  kind,
  baseURL: 'https://api.openai.com/v1',
  model: '',
  models: [],
  chats: [],
  projects: [],
  googleAccountIndex: 0,
  instruction: '',
});

export type CloudflareTranslationConfiguration = {
  endpoint: string;
  accountID: string;
  accountName: string;
  model: string;
  models: AIChoice[];
  instruction: string;
  lastChecked?: number;
};

export type TranslationPreferences = {
  engine: TranslationEngine;
  target: string;
  suggest: boolean;
  automatic: boolean;
  dynamicContent: boolean;
  excludedHosts: string[];
  providerID?: string;
  cloudflare?: CloudflareTranslationConfiguration;
  /** Zeus kept this Optional<Bool> with `?? true`; the default is encoded here. */
  retainTranslations: boolean | null;
  suggestionDuration: number | null;
  /** MOON EXTENSION: pre-translate the next N chapters (0 = off). */
  preloadNext?: number;
};

export const defaultTranslationPreferences = (): TranslationPreferences => ({
  engine: TranslationEngine.googleWeb,
  target: 'ar',
  suggest: true,
  automatic: false,
  dynamicContent: true,
  excludedHosts: [],
  retainTranslations: null,
  suggestionDuration: null,
});

export const translationLanguages: [string, string][] = [
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

export const isRTLLanguage = (language: string): boolean =>
  ['ar', 'fa', 'ur', 'he', 'ps', 'yi'].includes(
    language.split('-')[0].toLowerCase(),
  );

// --- preference helpers (verbatim semantics from the Swift extension) ---

export const keepsTranslations = (p: TranslationPreferences): boolean =>
  p.retainTranslations ?? true;

export const usesAIBatches = (p: TranslationPreferences): boolean =>
  p.engine === TranslationEngine.ai ||
  p.engine === TranslationEngine.cloudflare;

export const streamsLargeBatches = (
  p: TranslationPreferences,
  provider?: AIProviderConfiguration | null,
): boolean =>
  p.engine === TranslationEngine.ai &&
  provider?.kind === AIProviderKind.openAICompatible;

/** Keychain account name holding the secret for this engine/provider. */
export const secretKey = (
  p: TranslationPreferences,
  provider?: AIProviderConfiguration | null,
): string => {
  switch (p.engine) {
    case TranslationEngine.microsoftVisco:
      return '';
    case TranslationEngine.googleCloud:
      return 'google-cloud';
    case TranslationEngine.cloudflare:
      return 'cloudflare-workers-ai';
    default:
      return provider?.id ?? '';
  }
};

export const suggestionSeconds = (p: TranslationPreferences): number =>
  Math.min(30, Math.max(0, p.suggestionDuration ?? 1.5));

export class TranslationFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationFailure';
  }
}

// --- Cloudflare defaults (public connection metadata only) ---

export const CLOUDFLARE_DEFAULT_ENDPOINT =
  'https://zeus-translation.cookies-studio-36c499.workers.dev';
export const CLOUDFLARE_DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';

export const newCloudflareConfiguration =
  (): CloudflareTranslationConfiguration => ({
    endpoint: CLOUDFLARE_DEFAULT_ENDPOINT,
    accountID: '',
    accountName: '',
    model: CLOUDFLARE_DEFAULT_MODEL,
    models: [],
    instruction: '',
  });
