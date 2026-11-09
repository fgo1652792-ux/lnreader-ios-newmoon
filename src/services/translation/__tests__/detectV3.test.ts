// detect — v3 Latin-script resolution: Latin text must not blanket-answer
// "en" when the actual language is Spanish/Turkish/etc., and the document /
// plugin hint is honoured when nothing contradicts it.

import { detectLanguage } from '../detect';

describe('detectLanguage — Latin refinement (v3)', () => {
  const latinSample = (words: number) =>
    Array.from({ length: words }, (_, i) => `word${i} `).join('');

  it('detects Spanish from ñ/¿ markers', () => {
    const sample = `¿Dónde está la niña pequeña? ${latinSample(60)}`;
    expect(detectLanguage(sample)).toBe('es');
  });

  it('detects Turkish from ş/ğ markers', () => {
    const sample = `Başka bir gün, yoğurt ve şeker ${latinSample(60)}`;
    expect(detectLanguage(sample)).toBe('tr');
  });

  it('detects German from ß', () => {
    const sample = `Die Straße war groß und schön ${latinSample(60)}`;
    expect(detectLanguage(sample)).toBe('de');
  });

  it('still detects plain English', () => {
    expect(detectLanguage(`the boy and his dog was here ${latinSample(80)}`)).toBe('en');
  });

  it('trusts a Latin hint when markers do not contradict it', () => {
    // No distinctive markers → hint decides (Indonesian, for example).
    const sample = `Buku ini sangat bagus sekali ${latinSample(60)}`;
    expect(detectLanguage(sample, 'id')).toBe('id');
  });

  it('markers override a contradicting hint', () => {
    const sample = `¿Dónde está la niña? ${latinSample(60)}`;
    expect(detectLanguage(sample, 'fr')).toBe('es');
  });

  it('non-Latin scripts are unaffected', () => {
    expect(detectLanguage('هذه فقرة عربية طويلة نسبيا تحتوي على أحمد كافية للاكتشاف '.repeat(3))).toBe('ar');
  });
});
