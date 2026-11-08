import { TranslationFailure, type TranslationSegment } from './types';
import type { CloudflareTranslationConfiguration } from './providerTypes';
import { httpObject, validateEndpoint } from './transport';
import { validateAIResponse } from './validation';

// Port of Zeus Ascent Edition: ZEUSNext/CloudflareTranslationService.swift.
// Calls the USER'S own AI-bound Worker (connection file import), never the
// account management API. The token lives in SecureStore, never in prefs.

export const CLOUDFLARE_DEFAULT_ENDPOINT =
  'https://zeus-translation.cookies-studio-36c499.workers.dev';
export const CLOUDFLARE_DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';

// CloudflareTranslationService.translate — POST {endpoint}/v1/translate with
// segments; response must satisfy version==1 && model==config.model.
export const translateCloudflare = async (
  segments: TranslationSegment[],
  target: string,
  config: CloudflareTranslationConfiguration | null,
  secret: string,
): Promise<TranslationSegment[]> => {
  const active = config ?? {
    endpoint: CLOUDFLARE_DEFAULT_ENDPOINT,
    accountID: '',
    accountName: '',
    model: CLOUDFLARE_DEFAULT_MODEL,
    models: [],
    instruction: '',
    lastChecked: null,
  };
  const url = validateEndpoint(active.endpoint, '/v1/translate');
  const value = (await httpObject(url.toString(), {
    method: 'POST',
    body: JSON.stringify({
      model: active.model,
      target,
      instruction: active.instruction,
      segments: segments.map(row => ({ id: row.id, text: row.text })),
    }),
    headers: {
      Authorization: `Bearer ${secret}`,
      'User-Agent': 'MoonNovels/2.2 (Android;iOS; Translation)',
    },
  })) as { version?: number; model?: string; translations?: unknown };
  if (
    value?.version !== 1 ||
    value?.model !== active.model ||
    !Array.isArray(value?.translations)
  ) {
    throw new TranslationFailure('رد Cloudflare لا يطابق النموذج المطلوب؛ بقيت النصوص الأصلية.');
  }
  const rows = (value.translations as { id?: unknown; text?: unknown }[]).map(row => ({
    id: String(row?.id ?? ''),
    text: String(row?.text ?? ''),
  }));
  // Same strict validation as AI responses (same ID set, unique, non-empty).
  return validateAIResponse(JSON.stringify(rows), segments);
};

export interface CloudflareDiscovery {
  models: { id: string; name: string }[];
  accountID: string;
  accountName: string;
  defaultModel: string;
}

// CloudflareTranslationService.discoverModels — GET {endpoint}/v1/models.
// Constraints ported: <=100 models, all ids prefixed "@cf/", all rows valid,
// ids unique. Listing models does NOT prove inference works (lastChecked=nil).
export const discoverCloudflareModels = async (
  endpoint: string,
  secret: string,
): Promise<CloudflareDiscovery> => {
  const url = validateEndpoint(endpoint, '/v1/models');
  const value = (await httpObject(url.toString(), {
    headers: { Authorization: `Bearer ${secret}` },
  })) as {
    version?: number;
    models?: { id?: unknown; name?: unknown }[];
    accountID?: unknown;
    accountName?: unknown;
    defaultModel?: unknown;
  };
  const rows = Array.isArray(value?.models) ? (value?.models as { id?: unknown; name?: unknown }[]) : [];
  if (rows.length > 100) {
    throw new TranslationFailure('أعاد Worker قائمة نماذج أكبر من الحد المسموح.');
  }
  const models: { id: string; name: string }[] = [];
  for (const row of rows) {
    const id = typeof row?.id === 'string' ? row.id : '';
    if (!id.startsWith('@cf/') || id.length > 200) {
      throw new TranslationFailure('قائمة نماذج Cloudflare تحتوي معرّفًا غير صالح.');
    }
    models.push({ id, name: typeof row?.name === 'string' ? row.name : id });
  }
  if (new Set(models.map(row => row.id)).size !== models.length) {
    throw new TranslationFailure('قائمة نماذج Cloudflare تحتوي معرّفات مكررة.');
  }
  const accountID = typeof value?.accountID === 'string' ? value.accountID : '';
  return {
    models,
    accountID,
    accountName: typeof value?.accountName === 'string' && value.accountName ? value.accountName : 'Cloudflare',
    defaultModel: typeof value?.defaultModel === 'string' ? value.defaultModel : '',
  };
};

// Cloudflare token shape gate: exactly 43 chars of base64url alphabet.
export const validateCloudflareToken = (secret: string): void => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    throw new TranslationFailure(
      'رمز Workers AI غير صالح. استورد ملف الاتصال الخاص بحسابك أو أدخل رمزًا مكوّنًا من 43 محرفًا.',
    );
  }
};

// CloudflareConnection file import (Zeus CloudflareConnection struct): version
// 1, accountID 32 hex chars, model @cf/*, file content <= 16 KB handled by the
// caller when reading the JSON.
export interface CloudflareConnectionFile {
  version: number;
  endpoint: string;
  token: string;
  accountID: string;
  accountName: string;
  model: string;
}

export const parseCloudflareConnection = (raw: string): CloudflareConnectionFile => {
  if (raw.length > 16_384) {
    throw new TranslationFailure('ملف اتصال Cloudflare أكبر من الحد المسموح (16 كيلوبايت).');
  }
  let value: CloudflareConnectionFile;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new TranslationFailure('ملف اتصال Cloudflare ليس JSON صالحًا.');
  }
  if (
    value.version !== 1 ||
    !/^[0-9a-fA-F]{32}$/.test(value.accountID ?? '') ||
    (value.accountName ?? '').length > 200 ||
    !(value.model ?? '').startsWith('@cf/') ||
    value.model.length > 200
  ) {
    throw new TranslationFailure('ملف اتصال Cloudflare لا يطابق البنية المطلوبة.');
  }
  validateCloudflareToken(value.token ?? '');
  return value;
};

// Error-code map from CloudflareTranslationService.swift (user messages).
export const cloudflareErrorMessage = (code: string): string => {
  switch (code) {
    case 'daily_quota':
      return 'استُنفدت حصة اليوم من Workers AI (تُجدد في 00:00 UTC).';
    case 'capacity':
      return 'نموذج Cloudflare ممتلئ حاليًا؛ أعد المحاولة بعد قليل.';
    case 'rate_limit':
      return 'وصلت إلى حد معدل الطلبات في Cloudflare.';
    case 'paid_plan_required':
      return 'هذا النموذج يتطلب خطة Cloudflare مدفوعة.';
    case 'model_terms':
      return 'يجب قبول شروط النموذج في لوحة Cloudflare أولًا.';
    case 'invalid_connection':
      return 'بيانات اتصال Cloudflare غير صالحة.';
    case 'incomplete_translation':
    case 'invalid_translation':
      return 'أعاد Worker ترجمة غير مكتملة؛ بقيت النصوص الأصلية.';
    case 'request_too_large':
      return 'الطلب أكبر من سعة Worker.';
    case 'provider_timeout':
      return 'انتهت مهلة Worker.';
    default:
      return `خطأ Cloudflare (${code}).`;
  }
};
