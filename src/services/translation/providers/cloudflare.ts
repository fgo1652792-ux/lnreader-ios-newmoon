// src/services/translation/providers/cloudflare.ts
//
// Port of ZEUSNext/CloudflareTranslationService.swift — translation through
// the user's AI-bound Worker (ZEUS translation protocol v1). The endpoint in
// the Zeus repository is a user-personal Worker, NOT a shared service: the
// app ships the default only as a placeholder and requires the user to
// import their own connection (endpoint + 43-char token), exactly like Zeus.

import {
  AIChoice,
  CloudflareTranslationConfiguration,
  TranslationFailure,
  TranslationSegment,
  CLOUDFLARE_DEFAULT_ENDPOINT,
  CLOUDFLARE_DEFAULT_MODEL,
} from '../types';
import { buildRequest, endpoint } from '../transport';
import { validateAIResponse } from '../segments';

const MAX_RESPONSE_BYTES = 2_000_000;

const CONNECTION_CHARSET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';

/** Zeus CloudflareTranslationService.request — token shape gate. */
const cloudflareRequest = (
  cfg: CloudflareTranslationConfiguration,
  path: string,
  secret: string,
  body?: unknown,
): { url: URL; init: RequestInit } => {
  const valid =
    secret.length === 43 &&
    Array.from(secret).every(ch => CONNECTION_CHARSET.includes(ch));
  if (!valid) {
    throw new TranslationFailure(
      'استورد ملف ربط Cloudflare لهذا البروفايل من إعدادات الترجمة أولًا.',
    );
  }
  const url = endpoint(cfg.endpoint || CLOUDFLARE_DEFAULT_ENDPOINT, path);
  const init = buildRequest(url, {
    method: body === undefined ? 'GET' : 'POST',
    body,
    headers: {
      Authorization: `Bearer ${secret}`,
      'User-Agent': 'MoonNovels/2.3.0 (iOS; Translation)',
    },
  });
  return { url, init };
};

const cloudflareObject = async (
  cfg: CloudflareTranslationConfiguration,
  path: string,
  secret: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> => {
  const { url, init } = cloudflareRequest(cfg, path, secret, body);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const response = await fetch(url.toString(), {
      ...init,
      signal: controller.signal,
    });
    const declared = Number(response.headers.get('Content-Length') ?? 0);
    if (declared > MAX_RESPONSE_BYTES) {
      throw new TranslationFailure('رد Cloudflare أكبر من الحد المسموح.');
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new TranslationFailure('رد Cloudflare أكبر من الحد المسموح.');
    }
    let value: Record<string, unknown> | null = null;
    try {
      value = JSON.parse(new TextDecoder().decode(buffer));
    } catch {
      value = null;
    }
    if (!(response.status >= 200 && response.status < 300)) {
      const code =
        value && typeof value.error === 'string' ? value.error : null;
      throw new TranslationFailure(
        cloudflareErrorMessage(code, response.status),
      );
    }
    if (!value || value.error != null) {
      throw new TranslationFailure(
        'أعاد Cloudflare استجابة غير صالحة؛ لم تُعد المحاولة تلقائيًا.',
      );
    }
    return value;
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
};

/** Zeus errorMessage() — verbatim Arabic guidance per error code. */
export const cloudflareErrorMessage = (
  code: string | null,
  status: number,
): string => {
  switch (code) {
    case 'daily_quota':
      return 'نفدت حصة Cloudflare اليومية المجانية. تُجدّد عند 00:00 UTC. الترجمات المحفوظة تظل متاحة؛ يمكنك اختيار محرك آخر.';
    case 'capacity':
      return 'نموذج Cloudflare مشغول حاليًا. أعد المحاولة لاحقًا أو اختر نموذجًا آخر؛ لم نكرر الطلب تلقائيًا.';
    case 'rate_limit':
      return 'بلغ اتصال Cloudflare حد الطلبات خلال الدقيقة. انتظر قليلًا ثم تابع.';
    case 'paid_plan_required':
      return 'يتطلب هذا النموذج خطة Cloudflare مدفوعة. اختر نموذجًا آخر؛ لم يغيّر التطبيق خطة حسابك.';
    case 'model_terms':
      return 'يلزم قبول شروط هذا النموذج في لوحة Workers AI بحساب Cloudflare.';
    case 'invalid_connection':
      return 'رمز ربط Cloudflare غير صالح أو أُلغي. استورد ملف الربط الصحيح لهذا البروفايل.';
    case 'incomplete_translation':
    case 'invalid_translation':
      return 'لم يُرجع Cloudflare كل النصوص بالصيغة المطلوبة. بقي الأصل دون تغيير ولم نكرر الطلب؛ يمكنك تجربة النموذج الآخر.';
    case 'request_too_large':
      return 'تجاوزت دفعة الترجمة حد Cloudflare. جرّب النموذج الآخر أو أعد فتح الصفحة.';
    case 'provider_timeout':
      return 'انتهت مهلة نموذج Cloudflare. لم تُعد المحاولة تلقائيًا لتجنّب استهلاك الحصة مرتين.';
    default:
      return `تعذر الاتصال بترجمة Cloudflare (HTTP ${status}). بقيت النصوص الأصلية.`;
  }
};

export const translateCloudflare = async (
  segments: TranslationSegment[],
  target: string,
  config: CloudflareTranslationConfiguration | undefined,
  secret: string,
  signal: AbortSignal,
): Promise<TranslationSegment[]> => {
  const cfg = config ?? {
    endpoint: CLOUDFLARE_DEFAULT_ENDPOINT,
    accountID: '',
    accountName: '',
    model: CLOUDFLARE_DEFAULT_MODEL,
    models: [],
    instruction: '',
  };
  const body = {
    model: cfg.model,
    target,
    instruction: cfg.instruction,
    segments: segments.map(s => ({ id: s.id, text: s.text })),
  };
  const object = await cloudflareObject(
    cfg,
    'v1/translate',
    secret,
    body,
    signal,
  );
  if (
    object.version !== 1 ||
    object.model !== cfg.model ||
    !Array.isArray(object.translations)
  ) {
    throw new TranslationFailure(
      'رد Cloudflare لا يطابق النموذج المطلوب؛ بقيت النصوص الأصلية.',
    );
  }
  return validateAIResponse(JSON.stringify(object.translations), segments);
};

/** Zeus discover() — model listing through the same Worker protocol. */
export const discoverCloudflare = async (
  config: CloudflareTranslationConfiguration,
  secret: string,
  signal?: AbortSignal,
): Promise<CloudflareTranslationConfiguration> => {
  const object = await cloudflareObject(
    config,
    'v1/models',
    secret,
    undefined,
    signal,
  );
  if (
    object.version !== 1 ||
    !Array.isArray(object.models) ||
    object.models.length > 100
  ) {
    throw new TranslationFailure('الخادم لا يوفّر واجهة ترجمة متوافقة.');
  }
  const models: AIChoice[] = [];
  for (const row of object.models as Record<string, unknown>[]) {
    const id = row.id;
    const name = row.name;
    if (
      typeof id !== 'string' ||
      !id.startsWith('@cf/') ||
      typeof name !== 'string'
    ) {
      continue;
    }
    models.push({ id, name });
  }
  if (
    !models.length ||
    models.length !== (object.models as unknown[]).length ||
    new Set(models.map(m => m.id)).size !== models.length
  ) {
    throw new TranslationFailure('لم يُرجع الخادم قائمة نماذج صالحة.');
  }
  const result = { ...config, models };
  result.accountID =
    typeof object.accountID === 'string' ? object.accountID : '';
  result.accountName =
    typeof object.accountName === 'string' ? object.accountName : 'Cloudflare';
  if (!models.some(m => m.id === result.model)) {
    const suggested =
      typeof object.defaultModel === 'string' ? object.defaultModel : null;
    result.model = models.find(m => m.id === suggested)?.id ?? models[0].id;
  }
  result.lastChecked = undefined; // Listing models does not prove that inference works.
  return result;
};

/** Zeus CloudflareConnection.decode — import file validation (no network). */
export const decodeCloudflareConnection = (
  data: string,
): CloudflareTranslationConfiguration & { token: string } => {
  if (data.length > 16_384) {
    throw new TranslationFailure('ملف ربط Cloudflare غير صالح.');
  }
  let value: {
    version?: number;
    endpoint?: string;
    token?: string;
    accountID?: string;
    accountName?: string;
    model?: string;
  };
  try {
    value = JSON.parse(data);
  } catch {
    throw new TranslationFailure('ملف ربط Cloudflare غير صالح.');
  }
  const accountID = value.accountID ?? '';
  const model = value.model ?? '';
  if (
    value.version !== 1 ||
    accountID.length !== 32 ||
    !Array.from(accountID).every(c => /[0-9a-fA-F]/.test(c)) ||
    (value.accountName ?? '').length > 200 ||
    !model.startsWith('@cf/') ||
    model.length > 200
  ) {
    throw new TranslationFailure('ملف ربط Cloudflare غير صالح.');
  }
  return {
    endpoint: value.endpoint ?? CLOUDFLARE_DEFAULT_ENDPOINT,
    accountID,
    accountName: value.accountName ?? '',
    model,
    models: [],
    instruction: '',
    token: value.token ?? '',
  };
};
