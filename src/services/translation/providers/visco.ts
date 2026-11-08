// src/services/translation/providers/visco.ts
//
// Port of ZEUSNext/ViscoTranslationService.swift — Microsoft translation
// through the user-community proxy "Visco". This is NOT Microsoft's official
// authenticated endpoint; the request carries text/language only and no
// credentials. Marked experimental in the UI (the proxy may disappear).

import { TranslationFailure, TranslationSegment } from '../types';
import { httpFetch } from '../transport';

export const VISCO_ENDPOINT = 'https://viscodev.x10.mx/trans/api.php';

/** Zeus split() — byte-based splitting at ≤1200 bytes per part. */
export const viscoSplit = (text: string): string[] => {
  const result: string[] = [];
  let part = '';
  let bytes = 0;
  for (const ch of text) {
    const count = ch.length > 1 ? 4 : ch.charCodeAt(0) > 0x7f ? 2 : 1;
    if (count > 1200) {
      throw new TranslationFailure(
        'يوجد محرف أكبر من سعة رابط خدمة Visco. اختر مزودًا آخر لهذا النص.',
      );
    }
    if (bytes + count > 1200 && part) {
      result.push(part);
      part = '';
      bytes = 0;
    }
    part += ch;
    bytes += count;
  }
  if (part) result.push(part);
  return result;
};

const viscoRequest = (text: string, target: string): URL => {
  const url = new URL(VISCO_ENDPOINT);
  url.searchParams.set('text', text);
  url.searchParams.set('to', target === 'zh-CN' ? 'zh-Hans' : target);
  return url;
};

const viscoParse = (object: unknown): string => {
  const value = object as { ok?: boolean; translated?: string } | null;
  if (
    !value ||
    value.ok !== true ||
    typeof value.translated !== 'string' ||
    !value.translated.trim().length
  ) {
    throw new TranslationFailure(
      'لم تُرجع خدمة Visco ترجمة صالحة. أعد المحاولة أو اختر مزودًا آخر.',
    );
  }
  return value.translated;
};

/** Zeus translate() — sequential per-segment requests. */
export const translateVisco = async (
  segments: TranslationSegment[],
  target: string,
  signal: AbortSignal,
): Promise<TranslationSegment[]> => {
  const results: TranslationSegment[] = [];
  for (const segment of segments) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const object = await httpFetch(
      viscoRequest(segment.text, target).toString(),
      {
        signal,
        headers: { Accept: 'application/json' },
      },
    );
    results.push({ id: segment.id, text: viscoParse(object) });
  }
  return results;
};
