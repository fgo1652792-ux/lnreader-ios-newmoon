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

// Latin-script refinement (Moon v3): Latin is shared by en/fr/es/de/tr/pt/it
// and more, so raw script counting alone wrongly answers "en". Weight highly
// distinctive letters/words unique to one language, then fall back to the
// document/plugin hint when it is a Latin language and nothing contradicts it.
const LATIN_MARKERS: [string, RegExp][] = [
  ['es', /[ñ¿¡]/g],
  ['de', /[ß]/g],
  ['tr', /[şğİı]/g],
  ['pt', /[ãõ]/g],
  ['fr', /[çœàèêëîïôûù]/g],
  ['it', /[àèìòù]/g],
  ['vi', /[ăâđêôơư]/g],
  ['pl', /[ąćęłńśźż]/g],
  ['cs', /[ěščřžů]/g],
];

const LATIN_LANGUAGES = new Set([
  'en', 'fr', 'es', 'de', 'tr', 'pt', 'it', 'id', 'vi', 'pl', 'cs',
  'nl', 'sv', 'no', 'da', 'fi', 'hu', 'ro', 'cs', 'el', 'fil', 'ca',
]);

const latinMarkersOf = (sample: string): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const [language, pattern] of LATIN_MARKERS) {
    const matches = sample.match(pattern);
    if (matches && matches.length > 0) counts.set(language, matches.length);
  }
  return counts;
};

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
  const scriptCount = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const latin = letters - scriptCount;
  const latinDominant = scriptCount === 0 && latin >= 25;
  if (letters < 25) {
    // Zeus fallback: prefer the document language hint, else empty.
    const primary = hint?.split('-')[0]?.toLowerCase() ?? '';
    return primary;
  }
  if (latinDominant) {
    // v3: resolve Latin-script languages instead of blanket-'en'.
    const markers = latinMarkersOf(sample);
    let markerBest = '';
    let markerCount = 0;
    for (const [language, count] of markers) {
      if (count > markerCount) {
        markerBest = language;
        markerCount = count;
      }
    }
    // Two or more distinctive letters is a confident non-English signal.
    if (markerBest && markerCount >= 2) return markerBest;
    // Strong English signal: common English words present, no markers.
    if (markerCount === 0 && /\b(the|and|of|to|was|is)\b/i.test(sample)) return 'en';
    // No contradiction and the hint is a Latin language -> trust the hint.
    const hintPrimary = hint?.split('-')[0]?.toLowerCase() ?? '';
    if (hintPrimary && hintPrimary !== 'en' && LATIN_LANGUAGES.has(hintPrimary)) {
      const hintMarkers = markers.get(hintPrimary) ?? 0;
      // Accept the hint unless another language's markers clearly dominate.
      if (markerBest === '' || markerBest === hintPrimary || hintMarkers >= markerCount) {
        return hintPrimary;
      }
      return markerBest;
    }
    if (markerBest && markerCount >= 1) return markerBest;
    return 'en';
  }
  let best = '';
  let bestCount2 = 0;
  for (const [language, count] of counts) {
    if (count > bestCount2) {
      best = language;
      bestCount2 = count;
    }
  }
  if (bestCount2 === 0 && latin >= 25) return 'en';
  // Kana presence makes Japanese dominant over shared Han script.
  const kana = counts.get('ja') ?? 0;
  const han = counts.get('zh') ?? 0;
  if (kana > 0 && han > 0 && best === 'zh' && kana >= han * 0.1) return 'ja';
  return best;
};

export const primarySubtag = (language: string): string =>
  (language ?? '').split('-')[0]?.toLowerCase() ?? '';
