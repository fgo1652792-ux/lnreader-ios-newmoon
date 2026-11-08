// src/services/translation/__tests__/detect.test.ts
// The RN replacement for NaturalLanguage NLLanguageRecognizer — contract:
// <25 letters → '', dominant script languages, Latin stop-word scoring.

import { detectLanguage, isForeignText } from '../detect';

const english = `It was a bright cold day in April, and the clocks were striking
thirteen. Winston Smith, his chin nuzzled into his breast in an effort to
escape the vile wind, slipped quickly through the glass doors of Victory
Mansions, though not quickly enough to prevent a swirl of gritty dust from
entering along with him.`;

const arabic = `كان يومًا باردًا مضيئًا في شهر نيسان، وكانت الساعات تدق الثانية عشرة.
انزع وينستون سميث الذي كان ذقنه مغموسًا في معطفه هربًا من الريح اللعينة،
وانسل سريعًا عبر الأبواب الزجاجية لمجمع النصر.`;

describe('detectLanguage (Zeus PageTranslation.detect contract)', () => {
  it('returns empty for samples with fewer than 25 letters', () => {
    expect(detectLanguage('Short text', '')).toBe('');
    expect(detectLanguage('', '')).toBe('');
  });

  it('detects Arabic script', () => {
    expect(detectLanguage(arabic, '')).toBe('ar');
  });

  it('detects English via stop-word scoring', () => {
    expect(detectLanguage(english, '')).toBe('en');
  });

  it('detects CJK (kana → ja) and Cyrillic', () => {
    expect(detectLanguage('これはペンです。それは本です。'.repeat(3), '')).toBe(
      'ja',
    );
    expect(
      detectLanguage(
        'Это простой текст для проверки языка системы.'.repeat(2),
        '',
      ),
    ).toBe('ru');
  });

  it('falls back to the html-lang hint for undetermined Latin text', () => {
    expect(
      detectLanguage('Randomword otherword thirdword fourthword.', 'de-DE'),
    ).toBe('de');
  });
});

describe('isForeignText (offer / auto-translate gate)', () => {
  it('flags English text against an Arabic target', () => {
    expect(isForeignText(english, 'ar')).toBe(true);
  });

  it('does not flag Arabic text against an Arabic target', () => {
    expect(isForeignText(arabic, 'ar')).toBe(false);
  });

  it('never flags undetectable samples (no offer without signal)', () => {
    expect(isForeignText('1234567890 !!! ???', 'ar')).toBe(false);
  });
});
