// src/services/translation/detect.ts
//
// ADAPTATION of Zeus's language detection. Zeus used Apple's NaturalLanguage
// NLLanguageRecognizer (not available in React Native JS). The port keeps the
// same contract used by PageTranslation.detect / ReaderTranslation.prepare:
//
//   • < 25 letters in the sample → '' (unknown — never offer/auto-translate)
//   • dominant language of the first ~3500 chars, or the html-lang hint
//     lowercased and cut at '-'
//
// Implementation: Unicode-script ranges give reliable answers for Arabic,
// Hebrew, Persian/Urdu (Arabic sub ranges are ambiguous → resolved by
// diacritic/letter frequencies), CJK, Cyrillic and Greek. Latin-script text
// falls back to stop-word scoring across the languages Zeus lists, which is
// sufficient for the offer/auto-translate decision (target ar). Documented as
// a fidelity loss: mixed-script samples lean on the hint more than NLLanguage
// would.

const sampleLimit = 3500;

const countMatches = (text: string, re: RegExp): number =>
  (text.match(re) ?? []).length;

const SCRIPTS: { language: string; re: RegExp }[] = [
  { language: 'ar', re: /[\u0600-\u06FF]/g },
  { language: 'he', re: /[\u0590-\u05FF]/g },
  { language: 'ru', re: /[\u0400-\u04FF]/g },
  { language: 'el', re: /[\u0370-\u03FF]/g },
  { language: 'ja', re: /[\u3040-\u30FF]/g }, // kana → Japanese
  { language: 'ko', re: /[\uAC00-\uD7AF\u1100-\u11FF]/g },
];

const STOP_WORDS: Record<string, string[]> = {
  en: [
    'the',
    'and',
    'is',
    'was',
    'of',
    'to',
    'in',
    'that',
    'it',
    'he',
    'she',
    'his',
    'her',
    'with',
    'for',
    'they',
    'you',
    'have',
    'not',
    'this',
  ],
  fr: [
    'le',
    'la',
    'les',
    'et',
    'est',
    'était',
    'une',
    'des',
    'que',
    'pour',
    'dans',
    'elle',
    'il',
    'pas',
    'avec',
    'sur',
    'au',
    'ce',
    'plus',
    'mais',
  ],
  es: [
    'el',
    'la',
    'los',
    'las',
    'y',
    'es',
    'era',
    'una',
    'que',
    'para',
    'con',
    'no',
    'por',
    'como',
    'pero',
    'más',
    'su',
    'le',
    'ya',
    'sobre',
  ],
  de: [
    'der',
    'die',
    'das',
    'und',
    'ist',
    'war',
    'ein',
    'eine',
    'nicht',
    'sich',
    'mit',
    'auf',
    'für',
    'auch',
    'als',
    'aber',
    'nach',
    'wie',
    'noch',
    'schon',
  ],
  tr: [
    'bir',
    've',
    'bu',
    'için',
    'ile',
    'değil',
    'olarak',
    'daha',
    'çok',
    'ama',
    'gibi',
    'kadar',
    'sonra',
    'önce',
    'var',
    'yok',
    'ise',
    'her',
    'benim',
    'senin',
  ],
  pt: [
    'o',
    'a',
    'os',
    'as',
    'e',
    'é',
    'uma',
    'que',
    'para',
    'com',
    'não',
    'por',
    'como',
    'mas',
    'mais',
    'seu',
    'quando',
    'muito',
    'nos',
    'já',
  ],
  it: [
    'il',
    'la',
    'i',
    'le',
    'e',
    'è',
    'una',
    'che',
    'per',
    'con',
    'non',
    'sono',
    'era',
    'come',
    'ma',
    'più',
    'suo',
    'quando',
    'anche',
    'già',
  ],
  id: [
    'yang',
    'dan',
    'itu',
    'dengan',
    'untuk',
    'tidak',
    'adalah',
    'dari',
    'ini',
    'akan',
    'pada',
    'dalam',
    'saya',
    'dia',
    'mereka',
    'bisa',
    'ada',
    'juga',
    'sudah',
    'atau',
  ],
};

const persianMarkers = /[\u067E\u0686\u0698\u06AF\u06CC]/g; // پ چ ژ گ ی
const urduMarkers = /[\u0679\u0688\u0691\u06BE\u06C1\u06C3\u06D2]/g; // ٹ ڈ ڑ ھ ہ ۃ ے

/**
 * Dominant language code ('ar', 'en', ...) or '' when there is not enough
 * alphabetic text to decide. Mirrors PageTranslation.detect.
 */
export const detectLanguage = (sample: string, hint: string): string => {
  const letters = sample.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 25) return '';
  const text = sample.slice(0, sampleLimit);

  // Script counting
  for (const script of SCRIPTS) {
    const count = countMatches(text, script.re);
    if (count >= letters * 0.4) {
      if (script.language === 'ar') {
        const persian = countMatches(text, persianMarkers);
        const urdu = countMatches(text, urduMarkers);
        if (persian > count * 0.02 && persian >= urdu) return 'fa';
        if (urdu > count * 0.02) return 'ur';
      }
      return script.language;
    }
  }

  // Latin-script heuristic: stop-word scoring
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (!words.length) return hint.split('-')[0].toLowerCase();
  const scores = new Map<string, number>();
  for (const [language, list] of Object.entries(STOP_WORDS)) {
    const set = new Set(list);
    let score = 0;
    for (const word of words) if (set.has(word)) score += 1;
    scores.set(language, score / words.length);
  }
  let best = '';
  let bestScore = 0;
  for (const [language, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = language;
    }
  }
  if (bestScore >= 0.06) return best;
  return hint.split('-')[0].toLowerCase();
};

/** True when the text plausibly differs from the target language. */
export const isForeignText = (
  sample: string,
  target: string,
  hint = '',
): boolean => {
  const language = detectLanguage(sample, hint);
  if (!language) return false;
  return language !== target.split('-')[0].toLowerCase();
};
