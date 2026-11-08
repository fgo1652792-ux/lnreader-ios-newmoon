// src/services/translation/transport.ts
//
// Port of ZEUSNext/AITransport.swift — safe network transport for the
// translation engine: HTTPS-only endpoint validation, credential-safe
// redirect handling, bounded response buffers and Arabic provider errors.
//
// ADAPTATIONS (documented, everything else is 1:1 semantics):
//   • URLSession → fetch + AbortController. Zeus blocked cross-origin /
//     TLS-downgrading redirects through a URLSessionTaskDelegate; RN's fetch
//     follows redirects internally and cannot intercept them. Compensations:
//     (1) endpoints are HTTPS-only (HTTP only for localhost), (2) when a
//     credential is attached and the platform exposes the FINAL response URL,
//     a cross-origin final response is rejected, (3) the streaming XHR path
//     (openAICompatible SSE) checks xhr.responseURL origin explicitly.
//   • Zeus streamed the body into a bounded buffer with per-byte cancellation;
//     RN reads via arrayBuffer() with the same 8 MB ceiling enforced on
//     Content-Length and on the received buffer.
//   • Task.checkCancellation() → throwIfAborted(signal).

import { TranslationFailure } from './types';

const MAX_RESPONSE_BYTES = 8_000_000;

export type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Attach the credential-aware final-URL guard (bearer/cookie requests). */
  credential?: boolean;
  timeoutMs?: number;
};

/** Zeus's AIRedirectPolicy as a post-hoc guard (see header ADAPTATIONS). */
const assertSameOrigin = (requestUrl: string, response?: Response): void => {
  if (!response || !response.url) return; // RN polyfill may omit response.url
  try {
    const a = new URL(requestUrl);
    const b = new URL(response.url);
    if (
      a.protocol !== b.protocol ||
      a.host !== b.host ||
      (a.port || '') !== (b.port || '')
    ) {
      throw new TranslationFailure(
        'أعاد المزود توجيه الطلب إلى نطاق آخر؛ رُفض الرد حمايةً لبيانات الاتصال.',
      );
    }
  } catch (e) {
    if (e instanceof TranslationFailure) throw e;
  }
};

/** Zeus AIHTTP.endpoint — HTTPS only, HTTP allowed for localhost loops. */
export const endpoint = (base: string, path = ''): URL => {
  let url: URL;
  try {
    url = new URL(base.trim());
  } catch {
    throw new TranslationFailure(
      'أدخل عنوان HTTPS صالحًا للمزود. HTTP متاح للخادم المحلي فقط.',
    );
  }
  const host = url.hostname;
  if (
    !host ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host))
    )
  ) {
    throw new TranslationFailure(
      'أدخل عنوان HTTPS صالحًا للمزود. HTTP متاح للخادم المحلي فقط.',
    );
  }
  if (path)
    {url.pathname = (url.pathname.replace(/\/$/, '') + '/' + path).replace(
      /\/{2,}/g,
      '/',
    );}
  return url;
};

export const encodeJSON = (object: unknown): string =>
  JSON.stringify(object, null, 0);

export const parseJSON = (data: string): unknown => JSON.parse(data);

export const buildRequest = (
  url: URL,
  options: RequestOptions = {},
): RequestInit => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    // RN handles string bodies directly — pre-encode like AIHTTP.request.
    init.body =
      typeof options.body === 'string'
        ? options.body
        : encodeJSON(options.body);
  }
  return init;
};

/** Zeus AIHTTP.validate — mapped status codes with the same Arabic messages. */
export const validateStatus = (status: number): void => {
  if (status >= 200 && status < 300) return;
  if (status === 401) {
    throw new TranslationFailure(
      'انتهت الجلسة أو مفتاح المزود غير صحيح. حدّث بيانات الاتصال.',
    );
  }
  if (status === 403) {
    throw new TranslationFailure(
      'رفض المزود الطلب. افتح موقعه لإكمال تسجيل الدخول أو تحقق من صلاحيات الحساب.',
    );
  }
  if (status === 429) {
    throw new TranslationFailure(
      'وصلت إلى حد استخدام المزود. انتظر قليلًا أو اختر مزودًا آخر.',
    );
  }
  throw new TranslationFailure(`تعذر الاتصال بالمزود (HTTP ${status}).`);
};

const assertSize = (bytes: number): void => {
  if (bytes > MAX_RESPONSE_BYTES) {
    throw new TranslationFailure('رد المزود أكبر من الحد المسموح.');
  }
};

/** fetch() with Zeus's validation + bounded buffer + timeout. */
export const httpFetch = async (
  url: URL | string,
  options: RequestOptions = {},
): Promise<unknown> => {
  const urlText = typeof url === 'string' ? url : url.toString();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 60_000,
  );
  // External signal → internal controller (RN AbortSignal composition).
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);
  try {
    const response = await fetch(urlText, {
      ...buildRequest(url as URL, options),
      signal: controller.signal,
    });
    if (options.credential) assertSameOrigin(urlText, response);
    validateStatus(response.status);
    const declared = Number(response.headers.get('Content-Length') ?? 0);
    if (declared) assertSize(declared);
    const buffer = await response.arrayBuffer();
    assertSize(buffer.byteLength);
    return parseJSON(new TextDecoder().decode(buffer));
  } catch (e) {
    if (options.signal?.aborted)
      {throw new DOMException('Aborted', 'AbortError');}
    throw e;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
};

/** Zeus AIHTTP.form — sorted form encoding with '+' escaped, like the Swift path. */
export const encodeForm = (values: Record<string, string>): string => {
  const parts = Object.keys(values)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map(
      key =>
        `${encodeURIComponent(key)}=${encodeURIComponent(values[key]).replace(
          /\+/g,
          '%2B',
        )}`,
    );
  return parts.join('&');
};

/** Zeus AIHTTP.nested — index path into nested arrays. */
export const nested = (object: unknown, path: number[]): unknown => {
  let result: unknown = object;
  for (const index of path) {
    if (!Array.isArray(result) || index < 0 || index >= result.length) {
      return null;
    }
    result = (result as unknown[])[index];
  }
  return result;
};

/** Zeus AIHTTP.rpc — Google anti-XSSI frame walker. */
export const rpcFrames = (data: string, id: string): unknown[] => {
  const out: unknown[] = [];
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    const a = value as unknown[];
    if (
      a.length > 2 &&
      a[0] === 'wrb.fr' &&
      a[1] === id &&
      typeof a[2] === 'string'
    ) {
      try {
        out.push(JSON.parse(a[2]));
        return;
      } catch {
        return;
      }
    }
    for (const v of a) visit(v);
  };
  for (const line of data.split('\n')) {
    try {
      visit(JSON.parse(line));
    } catch {
      // non-JSON line — skipped, same as Swift
    }
  }
  return out;
};
