import { TranslationFailure, type TranslationSegment } from './types';

// Port of TextTranslationService.validateAIResponse — strict model-output
// validation shared by the AI and Cloudflare engines. Strips code fences, then
// requires: parseable JSON array, exact same ID set, unique IDs, non-empty
// texts, per-text character cap. Results are re-emitted in the original order.

export const validateAIResponse = (
  response: string,
  originals: TranslationSegment[],
  maximumTextCharacters = 30_000,
): TranslationSegment[] => {
  let text = response.trim();
  if (text.startsWith('```')) {
    const lines = text.split(/\r?\n/);
    text = lines.slice(1, lines.length > 1 ? -1 : undefined).join('\n');
  }
  let values: TranslationSegment[] = [];
  let valid = false;
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      values = parsed
        .filter(
          row =>
            row !== null &&
            typeof row === 'object' &&
            typeof (row as { id?: unknown }).id !== 'undefined' &&
            typeof (row as { text?: unknown }).text === 'string',
        )
        .map(row => {
          const record = row as { id?: unknown; text?: unknown };
          return { id: String(record.id), text: record.text as string };
        });
      const ids = new Set(values.map(row => row.id));
      valid =
        values.length === originals.length &&
        ids.size === values.length &&
        setsEqual(ids, new Set(originals.map(row => row.id))) &&
        values.every(
          row =>
            row.text.trim().length > 0 &&
            Array.from(row.text).length <= maximumTextCharacters,
        );
    }
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new TranslationFailure(
      'لم يُرجع نموذج الذكاء الاصطناعي ترجمة مكتملة بالصيغة المطلوبة. بقيت النصوص الأصلية؛ جرّب نموذجًا آخر أو أعد المحاولة.',
    );
  }
  const table = new Map(values.map(row => [row.id, row.text]));
  return originals.map(item => ({ id: item.id, text: table.get(item.id) as string }));
};

const setsEqual = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
};
