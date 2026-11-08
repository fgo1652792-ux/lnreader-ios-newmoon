// src/services/translation/providerService.ts
//
// Port of ZEUSNext/AIProviderService.swift — one reusable provider layer for
// translation. generate() dispatches per provider kind; discover() lists
// models. Account protocols (ChatGPT / Gemini) are ported faithfully from the
// Swift source and exposed as experimental options (private protocols may
// change without notice — surfaced in the UI, never silently swallowed).
//
// Browser-profile dependencies of the Swift original (BrowserModel/profile)
// are replaced by an explicit owner string: the Keychain service namespace.

import {
  AIChoice,
  AIProject,
  AIProviderConfiguration,
  AIProviderKind,
  TranslationFailure,
} from './types';
import { endpoint, httpFetch, nested, rpcFrames } from './transport';
import { uuid } from './uuid';

/** Chat-context continuity per translation run (Zeus actor state). */
const threads = new Map<string, unknown[]>();
const parents = new Map<string, [string, string]>();
type GeminiSession = { at: string; sid: string; build: string; cookie: string };
const googleSessions = new Map<string, GeminiSession>();

export const endProviderContext = (context: string): void => {
  threads.delete(context);
  parents.delete(context);
};

const bearer = (secret: string): Record<string, string> =>
  secret ? { Authorization: `Bearer ${secret}` } : {};

// ------------------------------------------------------------- ChatGPT --

/** Zeus chatGPTHeaders — JWT access token → account headers. */
export const chatGPTHeaders = (secret: string): Record<string, string> => {
  const parts = secret.trim().split('.');
  if (parts.length !== 3) {
    throw new TranslationFailure(
      'أدخل Access Token لحساب ChatGPT؛ مفتاح API يُستخدم مع مزود OpenAI المتوافق.',
    );
  }
  let encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  encoded += '='.repeat((4 - (encoded.length % 4)) % 4);
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(decodeBase64Utf8(encoded));
  } catch {
    throw new TranslationFailure('لم يتضمن الرمز معرّف حساب ChatGPT.');
  }
  const auth = claims['https://api.openai.com/auth'] as
    | { chatgpt_account_id?: string }
    | undefined;
  const account = auth?.chatgpt_account_id;
  if (!account) {
    throw new TranslationFailure('لم يتضمن الرمز معرّف حساب ChatGPT.');
  }
  if (typeof claims.exp === 'number' && claims.exp < Date.now() / 1000) {
    throw new TranslationFailure(
      'انتهت صلاحية رمز ChatGPT. أدخل رمزًا جديدًا.',
    );
  }
  return {
    Authorization: `Bearer ${secret}`,
    'ChatGPT-Account-ID': account,
    'User-Agent': 'ChatGPT/1.2026.195 (Android 16; build 2619512)',
    'oai-package-name': 'com.openai.chatgpt',
    'oai-client-type': 'android',
    'oai-device-id': uuid(),
    'chatgpt-residency-region': 'no_constraint',
    'x-device-tier': 'mid',
  };
};

/** Base64url → UTF-8 text (JWT payload claims) without runtime deps. */
const decodeBase64Utf8 = (input: string): string => {
  const charset =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const bytes: number[] = [];
  for (let i = 0; i < normalized.length; i += 4) {
    const n =
      (charset.indexOf(normalized[i] ?? 'A') << 18) |
      (charset.indexOf(normalized[i + 1] ?? 'A') << 12) |
      (charset.indexOf(normalized[i + 2] ?? 'A') << 6) |
      charset.indexOf(normalized[i + 3] ?? 'A');
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  try {
    // UTF-8 decode without TextDecoder on legacy runtimes.
    return decodeURIComponent(escape(binary));
  } catch {
    return binary;
  }
};

const accountGet = async (
  path: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> =>
  httpFetch(`https://android.chat.openai.com/backend-api/${path}`, {
    headers,
    signal,
  });

const chatGPTConversation = async (
  prompt: string,
  config: AIProviderConfiguration,
  secret: string,
  context: string,
  signal: AbortSignal,
): Promise<string> => {
  const headers = chatGPTHeaders(secret);
  let conversation = parents.get(context)?.[0] ?? config.conversationID;
  let parent = parents.get(context)?.[1] ?? uuid();
  if (!parents.has(context) && conversation) {
    const value = (await accountGet(
      `conversation/${conversation}`,
      headers,
      signal,
    )) as { current_node?: string } | null;
    parent = value?.current_node ?? parent;
  }
  const message: Record<string, unknown> = {
    id: uuid(),
    author: { role: 'user' },
    content: { content_type: 'text', parts: [prompt] },
    status: 'finished_successfully',
    recipient: 'all',
    metadata: {},
  };
  const q: Record<string, unknown> = {
    action: 'next',
    messages: [message],
    parent_message_id: parent,
    model: config.model,
    timezone: 'UTC',
    timezone_offset_min: 0,
    history_and_training_disabled: false,
    force_use_sse: true,
    stream: true,
    websocket_request_id: uuid(),
  };
  if (conversation) q.conversation_id = conversation;
  if (config.projectID) {
    (message.metadata as Record<string, unknown>).gizmo_id = config.projectID;
    q.conversation_mode = {
      kind: 'gizmo_interaction',
      gizmo_id: config.projectID,
    };
    q.conversation_origin = 'tpp';
  }
  // SSE is not JSON — read the raw text through the plain-text reader.
  const response = await fetchText(
    'https://android.chat.openai.com/backend-api/conversation',
    {
      method: 'POST',
      body: JSON.stringify(q),
      headers: {
        ...headers,
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      signal,
    },
  );
  let answer = '';
  let node = parent;
  for (const line of response.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(payload);
    } catch {
      continue;
    }
    if (typeof e.conversation_id === 'string') conversation = e.conversation_id;
    if (e.error != null) {
      throw new TranslationFailure(
        'أعاد ChatGPT خطأ أثناء التوليد. تحقق من الجلسة وحد الاستخدام.',
      );
    }
    const m = e.message as Record<string, unknown> | undefined;
    const author = m?.author as { role?: string } | undefined;
    if (author?.role === 'assistant') {
      const parts = ((m?.content as { parts?: unknown[] } | undefined)?.parts ??
        []) as unknown[];
      const text = parts
        .filter((p): p is string => typeof p === 'string')
        .join('');
      if (text.length) {
        answer = text;
        node = typeof m?.id === 'string' ? m.id : node;
      }
    }
  }
  if (!answer.length) {
    throw new TranslationFailure(
      'لم يصل رد نصي من ChatGPT. ربما تغير بروتوكول الحساب أو انتهت الجلسة.',
    );
  }
  if (conversation) parents.set(context, [conversation, node]);
  return answer;
};

// -------------------------------------------------------------- Gemini --

const capture = (text: string, pattern: string): string | null => {
  const match = text.match(new RegExp(pattern, 'm'));
  if (!match) return null;
  const found = match[0];
  const pieces = found.split('":"');
  return pieces[pieces.length - 1].replace(/"$/, '');
};

const geminiSession = async (
  config: AIProviderConfiguration,
  secret: string,
  refresh: boolean,
  signal: AbortSignal,
): Promise<GeminiSession> => {
  const key = `${config.id}:${config.googleAccountIndex}`;
  const existing = googleSessions.get(key);
  if (!refresh && existing && existing.cookie === secret) return existing;
  if (!secret || secret.includes('\n') || secret.includes('\r')) {
    throw new TranslationFailure(
      'أدخل ترويسة Cookie لحساب Google من جلسة تخصك.',
    );
  }
  const url = `https://gemini.google.com/u/${config.googleAccountIndex}/app`;
  const text = await fetchText(url, {
    headers: {
      Cookie: secret,
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html',
    },
    signal,
  });
  const at = capture(text, '"SNlM0e":"[^"]+"');
  const sid = capture(text, '"FdrFJe":"[^"]+"');
  if (!at || !sid) {
    throw new TranslationFailure(
      'لم تكتمل مصادقة Gemini. سجّل الدخول إلى موقعه وحدّث كوكيز الحساب.',
    );
  }
  const session: GeminiSession = {
    at,
    sid,
    build: capture(text, '"cfb2h":"[^"]+"') ?? '',
    cookie: secret,
  };
  googleSessions.set(key, session);
  return session;
};

const geminiRPC = async (
  config: AIProviderConfiguration,
  session: GeminiSession,
  id: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<unknown[]> => {
  const c = new URL(
    `https://gemini.google.com/u/${config.googleAccountIndex}/_/BardChatUi/data/batchexecute`,
  );
  c.searchParams.set('rpcids', id);
  c.searchParams.set('source-path', `/u/${config.googleAccountIndex}/app`);
  c.searchParams.set('f.sid', session.sid);
  c.searchParams.set('bl', session.build);
  c.searchParams.set('rt', 'c');
  const form =
    `at=${encodeURIComponent(session.at)}&` +
    `f.req=${encodeURIComponent(
      JSON.stringify([[[id, JSON.stringify(payload), null, 'generic']]]),
    )}`;
  const data = await fetchText(c.toString(), {
    method: 'POST',
    body: form,
    headers: {
      Cookie: session.cookie,
      Origin: 'https://gemini.google.com',
      Referer: 'https://gemini.google.com/',
      'X-Same-Domain': '1',
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    signal,
  });
  return rpcFrames(data, id);
};

const geminiConversation = async (
  prompt: string,
  config: AIProviderConfiguration,
  secret: string,
  context: string,
  signal: AbortSignal,
): Promise<string> => {
  const session = await geminiSession(config, secret, false, signal);
  let history = (threads.get(context) as unknown[] | undefined) ?? [
    '',
    '',
    '',
    null,
    null,
    null,
    null,
    null,
    null,
    '',
  ];
  if (!threads.has(context) && config.conversationID) {
    const turns = await geminiRPC(
      config,
      session,
      'hNvQHb',
      [config.conversationID, 1, null, 1, [1], [4], null, 1],
      signal,
    );
    const turn = turns[0] ? nested(turns[0], [0, 0]) : null;
    const rid = turn ? (nested(turn, [0, 1]) as string | null) : null;
    const rcid = turn ? (nested(turn, [3, 0, 0, 0]) as string | null) : null;
    if (!turn || !rid || !rcid) {
      throw new TranslationFailure(
        'تعذر جلب سياق محادثة Gemini المختارة؛ اختر محادثة جديدة أو حدّث القائمة.',
      );
    }
    history = [config.conversationID, rid, rcid, ...history.slice(3)];
  }
  const content: unknown[] = [
    [
      [prompt, 0, null, [], null, null, 0],
      ['ar'],
      history,
      null,
      null,
      null,
      [],
      0,
      [],
      [],
      1,
      0,
    ],
  ];
  const c = new URL(
    `https://gemini.google.com/u/${config.googleAccountIndex}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`,
  );
  c.searchParams.set('bl', session.build);
  c.searchParams.set('hl', 'ar');
  c.searchParams.set('f.sid', session.sid);
  c.searchParams.set('rt', 'c');
  c.searchParams.set(
    '_reqid',
    String(Math.floor(10000 + Math.random() * 90000)),
  );
  const headers: Record<string, string> = {
    Cookie: session.cookie,
    Origin: 'https://gemini.google.com',
    Referer: 'https://gemini.google.com/',
    'X-Same-Domain': '1',
  };
  const modelMeta = config.models.find(m => m.id === config.model)?.metadata;
  if (modelMeta) headers['x-goog-ext-525001261-jspb'] = modelMeta;
  const form =
    `at=${encodeURIComponent(session.at)}&` +
    `f.req=${encodeURIComponent(
      JSON.stringify([null, JSON.stringify(content)]),
    )}`;
  const data = await fetchText(c.toString(), {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: form,
    signal,
  });
  let result = '';
  for (const line of data.split('\n')) {
    let outer: unknown;
    try {
      outer = JSON.parse(line);
    } catch {
      continue;
    }
    const s = nested(outer, [0, 2]);
    if (typeof s !== 'string') continue;
    let inner: unknown;
    try {
      inner = JSON.parse(s);
    } catch {
      continue;
    }
    const text = nested(inner, [4, 0, 1, 0]);
    if (typeof text === 'string' && text.length) result = text;
    const cid = nested(inner, [1, 0]);
    const rid = nested(inner, [1, 1]);
    const rcid = nested(inner, [4, 0, 0]);
    if (
      typeof cid === 'string' &&
      typeof rid === 'string' &&
      typeof rcid === 'string'
    ) {
      const at =
        ((nested(inner, [3]) as Record<string, unknown> | null)?.[
          '26'
        ] as string) ?? '';
      threads.set(context, [
        cid,
        rid,
        rcid,
        null,
        null,
        null,
        null,
        null,
        null,
        at,
      ]);
    }
  }
  if (!result.length) {
    throw new TranslationFailure(
      'لم يُرجع Gemini نصًا. أعد اختبار الاتصال؛ بروتوكول الويب قد يتغير.',
    );
  }
  return result;
};

// ------------------------------------------------------------- generate --

/** Zeus AIProviderService.generate — non-streaming text per provider kind. */
export const providerGenerate = async (
  prompt: string,
  config: AIProviderConfiguration,
  secret: string,
  signal: AbortSignal,
): Promise<string> => {
  if (!config.model.length) {
    throw new TranslationFailure(
      'اختر نموذجًا بعد اختبار اتصال المزود في الإعدادات.',
    );
  }
  switch (config.kind) {
    case AIProviderKind.openAICompatible: {
      const value = (await httpFetch(
        endpoint(config.baseURL, 'chat/completions').toString(),
        {
          method: 'POST',
          body: {
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
          },
          headers: bearer(secret),
          signal,
          credential: true,
        },
      )) as {
        choices?: { message?: { content?: string } }[];
      } | null;
      const text = value?.choices?.[0]?.message?.content;
      if (!text || !text.length) {
        throw new TranslationFailure(
          'لم يُرجع المزود نصًا من chat/completions.',
        );
      }
      return text;
    }
    case AIProviderKind.geminiAPI: {
      if (!/^[A-Za-z0-9._-]+$/.test(config.model)) {
        throw new TranslationFailure('معرّف النموذج غير صالح.');
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`;
      const value = (await httpFetch(url, {
        method: 'POST',
        body: { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
        headers: { 'x-goog-api-key': secret },
        signal,
      })) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      } | null;
      const result = (value?.candidates?.[0]?.content?.parts ?? [])
        .map(p => p.text ?? '')
        .join('');
      if (!result.length) {
        throw new TranslationFailure(
          'لم يُرجع Gemini نصًا؛ قد يكون المحتوى مرفوضًا أو الحد مستنفدًا.',
        );
      }
      return result;
    }
    case AIProviderKind.chatGPTAccount:
      return chatGPTConversation(prompt, config, secret, uuid(), signal);
    case AIProviderKind.geminiAccount:
      return geminiConversation(prompt, config, secret, uuid(), signal);
  }
};

// -------------------------------------------------------------- discover --

/** Zeus AIProviderService.discover — model listing per provider kind. */
export const providerDiscover = async (
  input: AIProviderConfiguration,
  secret: string,
  signal: AbortSignal,
): Promise<AIProviderConfiguration> => {
  const config: AIProviderConfiguration = {
    ...input,
    discoveryNotice: undefined,
  };
  switch (config.kind) {
    case AIProviderKind.openAICompatible: {
      const url = endpoint(config.baseURL, 'models');
      const value = (await httpFetch(url.toString(), {
        headers: bearer(secret),
        signal,
        credential: true,
      })) as { data?: { id?: string; name?: string }[] } | null;
      config.models = (value?.data ?? [])
        .filter(item => typeof item.id === 'string')
        .map(item => ({
          id: item.id as string,
          name: item.name ?? (item.id as string),
        }))
        .sort((a, b) => (a.name < b.name ? -1 : 1));
      break;
    }
    case AIProviderKind.geminiAPI: {
      let page: string | null = null;
      const models: AIChoice[] = [];
      do {
        const c = new URL(
          'https://generativelanguage.googleapis.com/v1beta/models',
        );
        c.searchParams.set('pageSize', '100');
        if (page) c.searchParams.set('pageToken', page);
        const value = (await httpFetch(c.toString(), {
          headers: { 'x-goog-api-key': secret },
          signal,
        })) as {
          models?: {
            name?: string;
            displayName?: string;
            supportedGenerationMethods?: string[];
          }[];
          nextPageToken?: string;
        } | null;
        for (const m of value?.models ?? []) {
          if (
            typeof m.name === 'string' &&
            (m.supportedGenerationMethods ?? []).includes('generateContent')
          ) {
            models.push({
              id: m.name.replace('models/', ''),
              name: m.displayName ?? m.name,
            });
          }
        }
        page = value?.nextPageToken ?? null;
      } while (page && models.length < 500);
      config.models = models;
      break;
    }
    case AIProviderKind.chatGPTAccount: {
      const headers = chatGPTHeaders(secret);
      const list = (await accountGet('models', headers, signal)) as {
        models?: { slug?: string; title?: string }[];
      } | null;
      config.models = (list?.models ?? [])
        .filter(m => typeof m.slug === 'string')
        .map(m => ({
          id: m.slug as string,
          name: m.title ?? (m.slug as string),
        }));
      if (!config.models.some(m => m.id === 'auto')) {
        config.models.unshift({ id: 'auto', name: 'اختيار الحساب التلقائي' });
      }
      const chats: AIChoice[] = [];
      for (let offset = 0; offset < Math.min(50, 500); offset += 50) {
        const listPage = (await accountGet(
          `conversations?offset=${offset}&limit=50&order=updated&is_archived=false`,
          headers,
          signal,
        )) as { items?: { id?: string; title?: string }[] } | null;
        const items = (listPage?.items ?? [])
          .filter(m => typeof m.id === 'string')
          .map(m => ({
            id: m.id as string,
            name: m.title ?? 'محادثة بلا عنوان',
          }));
        chats.push(...items);
        if (items.length < 50) break;
      }
      config.chats = chats;
      try {
        const value = (await accountGet(
          'gizmos/snorlax/sidebar?owned_only=true&conversations_per_gizmo=100&limit=100',
          headers,
          signal,
        )) as { items?: Record<string, unknown>[] } | null;
        config.projects = (value?.items ?? []).map(item => {
          const wrapper =
            (item.gizmo as Record<string, unknown> | undefined) ?? {};
          const gizmo =
            (wrapper.gizmo as Record<string, unknown> | undefined) ?? wrapper;
          const display =
            (gizmo.display as Record<string, unknown> | undefined) ?? {};
          const conversationItems = ((
            item.conversations as {
              items?: { id?: string; title?: string }[] | undefined;
            }
          )?.items ?? []) as { id?: string; title?: string }[];
          return {
            id: String(gizmo.id ?? ''),
            name: (display.name as string) ?? 'مشروع',
            chats: conversationItems
              .filter(m => typeof m.id === 'string')
              .map(m => ({
                id: m.id as string,
                name: m.title ?? 'محادثة بلا عنوان',
              })),
          } satisfies AIProject;
        });
      } catch (e) {
        config.discoveryNotice =
          'جُلبت النماذج والمحادثات؛ تعذر جلب المشاريع: ' +
          (e instanceof Error ? e.message : String(e));
      }
      break;
    }
    case AIProviderKind.geminiAccount: {
      const session = await geminiSession(config, secret, true, signal);
      const status = await geminiRPC(config, session, 'otAQ7b', [], signal);
      config.models = [];
      const body = status[0];
      if (body) {
        const code = (nested(body, [14]) as number) ?? 1000;
        if (code !== 1000) {
          throw new TranslationFailure(
            `حساب Gemini غير جاهز (${code}). أكمل تسجيل الدخول وشروط الخدمة في موقعه.`,
          );
        }
        const tiers = (nested(body, [16]) as number[]) ?? [];
        const flags = (nested(body, [17]) as number[]) ?? [];
        const field = tiers.includes(21) || tiers.includes(22) ? 13 : 12;
        const capacity = tiers.includes(22)
          ? 2
          : tiers.includes(21)
          ? 1
          : flags.includes(115)
          ? 4
          : tiers.includes(16) || flags.includes(106)
          ? 3
          : tiers.includes(8) || flags.includes(19)
          ? 2
          : 1;
        const rows = (nested(body, [15]) as unknown[][]) ?? [];
        config.models = rows
          .filter(m => typeof m[0] === 'string')
          .map(m => {
            const id = m[0] as string;
            const name =
              (nested(m, [11]) as string) ??
              (nested(m, [19]) as string) ??
              (nested(m, [1]) as string) ??
              id;
            const header: unknown[] = [
              1,
              null,
              null,
              null,
              id,
              null,
              null,
              0,
              [4, 5, 6, 8],
              null,
              null,
            ];
            while (header.length <= field) header.push(null);
            header[field] = capacity;
            header.push(
              null,
              null,
              (nested(m, [17]) as number) ?? (nested(m, [9]) as number) ?? 1,
            );
            return {
              id,
              name,
              metadata: JSON.stringify(header),
            } satisfies AIChoice;
          });
      }
      config.chats = [];
      for (const pinned of [1, 0]) {
        const values = await geminiRPC(
          config,
          session,
          'MaZiqc',
          [Math.min(50, 500), null, [pinned, null, 1]],
          signal,
        );
        for (const value of values) {
          const rows = (nested(value, [2]) as unknown[][]) ?? [];
          for (const row of rows) {
            const id = row[0];
            const name = nested(row, [1]);
            if (
              typeof id === 'string' &&
              typeof name === 'string' &&
              !config.chats.some(c => c.id === id)
            ) {
              config.chats.push({ id, name });
            }
          }
        }
      }
      config.projects = []; // Gemini account does not expose ChatGPT-style Projects.
      break;
    }
  }
  if (!config.models.length) {
    throw new TranslationFailure(
      'اتصل الخادم لكنه لم يُرجع نماذج متاحة لهذا الحساب. لا توجد نماذج مُختلقة؛ تحقق من العنوان أو الجلسة.',
    );
  }
  if (!config.models.some(m => m.id === config.model)) {
    config.model = config.models[0].id;
  }
  config.lastChecked = Date.now();
  return config;
};

// ------------------------------------------------------------- raw text --

/** Plain-text response reader with the same status validation as httpFetch. */
const fetchText = async (url: string, init: RequestInit): Promise<string> => {
  const controller = new AbortController();
  const signal = init.signal as AbortSignal | undefined;
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const status = response.status;
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
    if (!(status >= 200 && status < 300)) {
      throw new TranslationFailure(`تعذر الاتصال بالمزود (HTTP ${status}).`);
    }
    return await response.text();
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw e;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
};
