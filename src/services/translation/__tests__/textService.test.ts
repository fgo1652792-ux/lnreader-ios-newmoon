// textService — pure splitting/parsing ports from Zeus
// TextTranslationService. Network dispatch inside translateSegments is
// intentionally not exercised here (no fetch mocking): it is composed
// entirely from the primitives under test (splitText / splitCloudflareText /
// parseGoogleBatch).

import { parseGoogleBatch, splitCloudflareText, splitText } from '../textService';
import { TranslationFailure, type TranslationSegment } from '../types';

// Strips every valid surrogate pair, then asserts no surrogate unit remains —
// the cheapest reliable "no lone surrogates" check.
const hasLoneSurrogate = (value: string): boolean =>
  /[\uD800-\uDFFF]/.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''));

describe('splitText', () => {
  it('keeps text at or under the limit as a single untouched part', () => {
    const short = 'مرحبا بالعالم';
    expect(splitText(short, 100)).toEqual([short]);

    const exact = 'abcdefghij'; // exactly 10 code points
    expect(splitText(exact, 10)).toEqual([exact]);
  });

  it('prefers a whitespace boundary in the second half over a mid-word hard cut', () => {
    // limit 10: the only usable boundary is the space at index 6 (> limit/2),
    // so the cut must land after it instead of inside "bbbb".
    const parts = splitText('aaaaaa bbbb cc', 10);
    expect(parts).toEqual(['aaaaaa ', 'bbbb cc']);
    expect(parts.join('')).toBe('aaaaaa bbbb cc');
    for (const part of parts) {
      expect(Array.from(part).length).toBeLessThanOrEqual(10);
    }
  });

  it('prefers sentence punctuation when it sits in the second half', () => {
    // limit 10: the '.' at index 7 beats the later 'c' run, cut = after dot.
    const parts = splitText('aaa.bbb.ccc.ddd', 10);
    expect(parts).toEqual(['aaa.bbb.', 'ccc.ddd']);
    expect(parts[0].endsWith('.')).toBe(true);
  });

  it('hard cuts at the limit when no boundary exists', () => {
    const parts = splitText('a'.repeat(25), 10);
    expect(parts).toEqual(['a'.repeat(10), 'a'.repeat(10), 'a'.repeat(5)]);
    expect(parts.join('')).toBe('a'.repeat(25));
  });

  it('cuts Arabic text right after a ؟ boundary', () => {
    // limit 10: '؟' (index 8) and the space (index 9) both qualify; the
    // scanner walks back and takes the space at index 9.
    const parts = splitText('بسم الله؟ الرحمن', 10);
    expect(parts).toEqual(['بسم الله؟ ', 'الرحمن']);
    expect(parts.join('')).toBe('بسم الله؟ الرحمن');
  });

  it('cuts at the ideographic full stop 。 in Arabic text', () => {
    // limit 6: '。' is at index 5 (> 3), so the part ends exactly after it.
    const parts = splitText('الحمد。لله رب', 6);
    expect(parts).toEqual(['الحمد。', 'لله رب']);
    expect(parts.join('')).toBe('الحمد。لله رب');
  });

  it('never cuts inside a surrogate pair (3000 𝕏 at limit 1000)', () => {
    const text = '𝕏'.repeat(3000);
    const parts = splitText(text, 1000);

    expect(parts).toHaveLength(3);
    expect(parts.join('')).toBe(text);
    for (const part of parts) {
      // Each part is a whole number of code points, never split mid-pair.
      expect(Array.from(part)).toHaveLength(1000);
      expect(part).toHaveLength(2000); // 1000 pairs = 2000 UTF-16 units
      expect(hasLoneSurrogate(part)).toBe(false);
      // Survives a JSON round trip unchanged and without throwing.
      expect(JSON.parse(JSON.stringify(part))).toBe(part);
    }
  });
});

describe('splitCloudflareText', () => {
  it('returns the text untouched while it fits the UTF-16 limit', () => {
    const text = 'a𠮷'; // 3 UTF-16 units
    expect(splitCloudflareText(text, 4)).toEqual([text]);
  });

  it('measures the limit in UTF-16 units and keeps surrogate pairs intact', () => {
    // 'a𠮷b𠮷c' = 7 UTF-16 units. limit 4 → the second 𠮷 (2 units) cannot
    // join the first buffer (4 + 2 > 4) and is never split.
    const text = 'a𠮷b𠮷c';
    const parts = splitCloudflareText(text, 4);

    expect(parts).toEqual(['a𠮷b', '𠮷c']);
    expect(parts.join('')).toBe(text);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(4);
      expect(hasLoneSurrogate(part)).toBe(false);
    }
  });
});

describe('parseGoogleBatch', () => {
  const originals: TranslationSegment[] = [
    { id: 's1', text: 'مرحبا' },
    { id: 's2', text: 'وداعا' },
  ];

  it('maps an array of plain strings back onto the original ids', () => {
    expect(parseGoogleBatch(['hello', 'goodbye'], originals)).toEqual([
      { id: 's1', text: 'hello' },
      { id: 's2', text: 'goodbye' },
    ]);
  });

  it('accepts rows wrapped in single-element arrays', () => {
    expect(parseGoogleBatch([['hello'], ['goodbye']], originals)).toEqual([
      { id: 's1', text: 'hello' },
      { id: 's2', text: 'goodbye' },
    ]);
  });

  it('throws the exact Arabic count-mismatch failure when row count differs', () => {
    const mismatch = () => parseGoogleBatch(['hello'], originals);
    expect(mismatch).toThrow(TranslationFailure);
    expect(mismatch).toThrow('بقيت الصفحة الأصلية');
  });

  it('throws the same failure when the response is not an array', () => {
    const notArray = () => parseGoogleBatch(null, originals);
    expect(notArray).toThrow(TranslationFailure);
    expect(notArray).toThrow('عدد نتائج دفعة Google لا يطابق النصوص');
  });

  it('throws the exact Arabic incomplete-translation failure on empty rows', () => {
    const emptyString = () => parseGoogleBatch(['hello', ''], originals);
    expect(emptyString).toThrow(TranslationFailure);
    expect(emptyString).toThrow('أعاد Google ترجمة ناقصة');

    const emptyWrapped = () => parseGoogleBatch(['hello', ['']], originals);
    expect(emptyWrapped).toThrow('أعاد Google ترجمة ناقصة');
  });
});
