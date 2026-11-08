// Replacement for NLLanguageRecognizer (iOS-only API) used by Zeus
// PageTranslation/ReaderTranslation for source-language detection.
// Script-counting heuristic: deterministic, dependency-free, and sufficient
// for the offer/automatic decision (never shown as a guaranteed result).
// Zeus gates: sample >= 25 letters, only the first 3500 characters considered.

const isLetter = (code: number): boolean =>
  (code >= 0x41 && code <= 0x5a) ||
  (code >= 0x61 && code <= 0x7a) ||
  (code >= 0x0400 && code <= 0x04ff) ||
  (code >= 0x0600 && code <= 0x06ff) ||
  (code >= 0x0590 && code <= 0x05ff) ||
  (code >= 0x0900 && code <= 0x097f) || // Devanagari (hi)
  (code >= 0x0e00 && code <= 0x0e7f) || // Thai (th)
  (code >= 0x3040 && code <= 0x30ff) ||
  (code >= 0x4e00 && code <= 0x9fff) ||
  (code >= 0xac00 && code <= 0xd7af) ||
  (code >= 0x0370 && code <= 0x03ff);

const SCRIPT_LANGUAGES: [string, (code: number) => boolean][] = [
  ['ja', c => (c >= 0x3040 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff)],
  ['ko', c => c >= 0xac00 && c <= 0xd7af],
  ['zh', c => (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)],
  ['ar', c => c >= 0x0600 && c <= 0x06ff],
  ['he', c => c >= 0x0590 && c <= 0x05ff],
  ['ru', c => c >= 0x0400 && c <= 0x04ff],
  ['hi', c => c >= 0x0900 && c <= 0x097f],
  ['th', c => c >= 0x0e00 && c <= 0x0e7f],
  ['el', c => c >= 0x0370 && c <= 0x03ff],
];

export const detectLanguage = (sampleRaw: string, hint?: string): string => {
  const sample = sampleRaw.slice(0, 3500);
  let letters = 0;
  const counts = new Map<string, number>();
  for (const character of sample) {
    const code = character.codePointAt(0) ?? 0;
    if (!isLetter(code)) continue;
    letters += 1;
    for (const [language, test] of SCRIPT_LANGUAGES) {
      if (test(code)) {
        counts.set(language, (counts.get(language) ?? 0) + 1);
        break;
      }
    }
  }
  // Latin fallback bucket (en/fr/es/de/tr/pt/it/id all share the script).
  const latin = letters - [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (letters < 25) {
    // Zeus fallback: prefer the document language hint, else empty.
    const primary = hint?.split('-')[0]?.toLowerCase() ?? '';
    return primary;
  }
  let best = '';
  let bestCount = 0;
  for (const [language, count] of counts) {
    if (count > bestCount) {
      best = language;
      bestCount = count;
    }
  }
  if (bestCount === 0 && latin >= 25) return 'en';
  // Kana presence makes Japanese dominant over shared Han script.
  const kana = counts.get('ja') ?? 0;
  const han = counts.get('zh') ?? 0;
  if (kana > 0 && han > 0 && best === 'zh' && kana >= han * 0.1) return 'ja';
  return best;
};

export const primarySubtag = (language: string): string =>
  (language ?? '').split('-')[0]?.toLowerCase() ?? '';
