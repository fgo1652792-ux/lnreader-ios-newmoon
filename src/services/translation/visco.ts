import { TranslationFailure, type TranslationSegment } from './types';
import { httpObject } from './transport';

// Port of Zeus Ascent Edition: ZEUSNext/ViscoTranslationService.swift.
// A user-community proxy for Microsoft Translator — NOT the official
// authenticated Microsoft endpoint. Carries text/language only.

export const VISCO_ENDPOINT = 'https://viscodev.x10.mx/trans/api.php';

const MAX_BYTES_PER_REQUEST = 1200;

const byteLength = (text: string): number => {
  // UTF-8 byte length without TextEncoder (Hermes-safe).
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {bytes += 1;}
    else if (code < 0x800) {bytes += 2;}
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4; // surrogate pair
      i += 1;
    } else {bytes += 3;}
  }
  return bytes;
};

// ViscoTranslationService.split — chunk to <=1200 UTF-8 bytes per request;
// a single character larger than the limit is a hard error (verbatim rule).
export const splitVisco = (text: string): string[] => {
  if (byteLength(text) <= MAX_BYTES_PER_REQUEST) return [text];
  const parts: string[] = [];
  let buffer = '';
  let size = 0;
  for (const character of text) {
    const length = byteLength(character);
    if (length > MAX_BYTES_PER_REQUEST) {
      throw new TranslationFailure('يوجد محرف أكبر من سعة رابط خدمة Visco؛ لا يمكن تقسيمه.');
    }
    if (size + length > MAX_BYTES_PER_REQUEST && buffer.length > 0) {
      parts.push(buffer);
      buffer = '';
      size = 0;
    }
    buffer += character;
    size += length;
  }
  if (buffer.length > 0) parts.push(buffer);
  return parts;
};

const mapTarget = (target: string): string => (target === 'zh-CN' ? 'zh-Hans' : target);

// ViscoTranslationService.translate — serial, one HTTP GET per segment
// (no batching; Zeus comment preserved through behaviour).
export const translateVisco = async (
  segments: TranslationSegment[],
  target: string,
): Promise<TranslationSegment[]> => {
  const output: TranslationSegment[] = [];
  for (const segment of segments) {
    const url = `${VISCO_ENDPOINT}?text=${encodeURIComponent(segment.text)}&to=${encodeURIComponent(mapTarget(target))}`;
    const value = (await httpObject(url, {
      accept: 'application/json',
      contentType: undefined,
    })) as { ok?: boolean; translated?: string };
    if (value?.ok !== true || !value.translated || value.translated.trim().length === 0) {
      throw new TranslationFailure('لم تُرجع خدمة Visco ترجمة صالحة.');
    }
    output.push({ id: segment.id, text: value.translated });
  }
  return output;
};
