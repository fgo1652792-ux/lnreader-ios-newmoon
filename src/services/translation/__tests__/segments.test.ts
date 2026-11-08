// src/services/translation/__tests__/segments.test.ts
// Port-fidelity tests for TextTranslationService.swift behavior:
// splitting, Google batch parsing, AI response validation, entity decoding.

import {
  decodeEntities,
  googleBatchRequest,
  parseGoogleBatch,
  splitCloudflare,
  splitText,
  validateAIResponse,
} from '../segments';

describe('splitText (Zeus split())', () => {
  it('returns single part under the limit', () => {
    expect(splitText('hello world', 100)).toEqual(['hello world']);
  });

  it('never splits mid-word when a boundary exists past the half point', () => {
    const text =
      'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd eeeeeeeeee ffffffffff';
    const parts = splitText(text, 30);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.startsWith(' ')).toBe(false);
    }
    expect(parts.join('')).toBe(text);
  });

  it('falls back to a hard cut without any boundary (long CJK run)', () => {
    const text = 'あ'.repeat(50);
    const parts = splitText(text, 20);
    expect(parts.join('')).toBe(text);
    expect(parts.every(p => p.length <= 20)).toBe(true);
  });

  it('reassembly preserves the original text exactly', () => {
    const text =
      'الفصل الأول: البداية. ثم استمر السرد عبر جملة طويلة جدًا تحتوي تفاصيل كثيرة لا تُختصر. ';
    expect(splitText(text, 24).join('')).toBe(text);
  });
});

describe('splitCloudflare (Zeus splitCloudflare())', () => {
  it('hard-cuts UTF-16 text at the limit', () => {
    const parts = splitCloudflare('x'.repeat(100), 30);
    expect(parts.reduce((a, b) => a + b, '')).toBe('x'.repeat(100));
    parts.forEach(p => expect(p.length).toBeLessThanOrEqual(30));
  });

  it('single part under limit', () => {
    expect(splitCloudflare('short', 30)).toEqual(['short']);
  });
});

describe('parseGoogleBatch (Zeus parseGoogleBatch())', () => {
  const originals = [
    { id: 'a', text: 'one' },
    { id: 'b', text: 'two' },
  ];

  it('accepts plain string rows', () => {
    expect(parseGoogleBatch(['واحد', 'اثنان'], originals)).toEqual([
      { id: 'a', text: 'واحد' },
      { id: 'b', text: 'اثنان' },
    ]);
  });

  it('accepts nested array rows (translate_a/t shape)', () => {
    expect(parseGoogleBatch([['واحد'], ['اثنان']], originals)).toEqual([
      { id: 'a', text: 'واحد' },
      { id: 'b', text: 'اثنان' },
    ]);
  });

  it('REJECTS a row-count mismatch instead of applying partial batches', () => {
    expect(() => parseGoogleBatch(['واحد'], originals)).toThrow(
      /عدد نتائج دفعة Google/,
    );
  });

  it('REJECTS empty translations', () => {
    expect(() => parseGoogleBatch(['', 'اثنان'], originals)).toThrow(
      /ترجمة ناقصة/,
    );
  });
});

describe('validateAIResponse (Zeus validateAIResponse())', () => {
  const originals = [
    { id: 'p1', text: 'Hello' },
    { id: 'p2', text: 'World' },
  ];

  it('accepts an exact JSON array with identical IDs', () => {
    const response = JSON.stringify([
      { id: 'p1', text: 'مرحبًا' },
      { id: 'p2', text: 'العالم' },
    ]);
    expect(validateAIResponse(response, originals)).toEqual([
      { id: 'p1', text: 'مرحبًا' },
      { id: 'p2', text: 'العالم' },
    ]);
  });

  it('strips a markdown fence wrapper', () => {
    const response =
      '```json\n' +
      JSON.stringify([
        { id: 'p1', text: 'مرحبًا' },
        { id: 'p2', text: 'العالم' },
      ]) +
      '\n```';
    expect(validateAIResponse(response, originals)).toHaveLength(2);
  });

  it('REJECTS unknown or missing IDs (stale-batch protection)', () => {
    const response = JSON.stringify([
      { id: 'p1', text: 'مرحبًا' },
      { id: 'pX', text: 'غريب' },
    ]);
    expect(() => validateAIResponse(response, originals)).toThrow(
      /لم يُرجع نموذج الذكاء الاصطناعي/,
    );
  });

  it('REJECTS duplicated IDs', () => {
    const response = JSON.stringify([
      { id: 'p1', text: 'مرحبًا' },
      { id: 'p1', text: 'مكرر' },
    ]);
    expect(() => validateAIResponse(response, originals)).toThrow();
  });

  it('REJECTS empty translations', () => {
    const response = JSON.stringify([
      { id: 'p1', text: '   ' },
      { id: 'p2', text: 'العالم' },
    ]);
    expect(() => validateAIResponse(response, originals)).toThrow();
  });

  it('REJECTS non-JSON garbage instead of writing it into the page', () => {
    expect(() =>
      validateAIResponse('هذه ليست مصفوفة JSON', originals),
    ).toThrow();
  });
});

describe('decodeEntities (Zeus decodeEntities())', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('&lt;p&gt; &quot;q&quot; &#39;a&#39;')).toBe(
      '<p> "q" \'a\'',
    );
  });

  it('decodes numeric and hex references', () => {
    expect(decodeEntities('&#1575;')).toBe('ا');
    expect(decodeEntities('&#x642;')).toBe('ق');
  });

  it('leaves invalid references untouched', () => {
    expect(decodeEntities('&#zz;')).toBe('&#zz;');
  });
});

describe('googleBatchRequest (Zeus googleBatchRequest())', () => {
  it('targets the gtx endpoint with sl=auto', () => {
    const { url } = googleBatchRequest(['hi'], 'ar');
    expect(url.toString()).toContain('translate.googleapis.com/translate_a/t');
    expect(url.searchParams.get('client')).toBe('gtx');
    expect(url.searchParams.get('tl')).toBe('ar');
    expect(url.searchParams.get('sl')).toBe('auto');
  });

  it('encodes a repeated q form body with + escaped', () => {
    const { body } = googleBatchRequest(['a b', 'c'], 'ar');
    expect(body).toContain('q=a%20b');
    expect(body).toContain('q=c');
  });
});
