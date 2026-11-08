// detectLanguage — script-counting heuristic replacing NLLanguageRecognizer:
// script-majority voting, the <25-letter hint fallback and the 3500-character
// sample slice (Zeus gates preserved).

import { detectLanguage } from '../detect';

describe('detectLanguage', () => {
  it('detects English from a Latin-only sample', () => {
    expect(
      detectLanguage('This is a plain English paragraph with enough letters to be detected.'),
    ).toBe('en');
  });

  it('detects Arabic from an Arabic-script sample', () => {
    expect(detectLanguage('هذا نص عربي طويل بما يكفي ليقرر الكشف أن اللغة عربية بلا شك')).toBe(
      'ar',
    );
  });

  it('detects Japanese from a kana-only sample', () => {
    expect(
      detectLanguage('これはひらがなだけのてすとぶんしょうです。けっこうながいのでにじゅうもじはこえますよね。'),
    ).toBe('ja');
  });

  it('detects Chinese from a Han-only sample', () => {
    expect(detectLanguage('这是一段完全由汉字组成的测试文字用来确认检测器可以识别中文而不会误判成日文很好')).toBe(
      'zh',
    );
  });

  it('detects Russian from a Cyrillic sample', () => {
    expect(
      detectLanguage('Это пример русского текста с достаточным количеством букв для надёжного определения'),
    ).toBe('ru');
  });

  it('falls back to the primary hint subtag when the sample has fewer than 25 letters', () => {
    expect(detectLanguage('مرحبا', 'ar-EG')).toBe('ar');
    expect(detectLanguage('Ok then', 'en-US')).toBe('en');
    expect(detectLanguage('x', 'FR-ca')).toBe('fr');
    expect(detectLanguage('x')).toBe('');
  });

  it('only considers the first 3500 characters of the sample', () => {
    // 3500 Arabic letters followed by 5000 Cyrillic ones: if the tail were
    // counted, Cyrillic (5000) would outnumber Arabic (3500) and return 'ru'.
    const sample = 'ا'.repeat(3500) + 'р'.repeat(5000);
    expect(sample.length).toBeGreaterThan(3500);
    expect(detectLanguage(sample)).toBe('ar');
  });

  it('prefers Japanese when kana presence passes the dominance threshold over Han', () => {
    // 40 Han + 6 kana: kana >= 10% of Han → Japanese wins despite Han majority.
    expect(detectLanguage('漢字'.repeat(20) + 'かな'.repeat(3))).toBe('ja');
    // 100 Han + 2 kana: kana below the 10% threshold → Chinese stays.
    expect(detectLanguage('漢字'.repeat(50) + 'かな')).toBe('zh');
  });
});
