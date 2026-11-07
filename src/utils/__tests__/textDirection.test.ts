import { I18nManager } from 'react-native';

import { detectTextDirection } from '../textDirection';

const mockUIDirection = (isRTL: boolean) => {
  (I18nManager.getConstants as jest.Mock).mockReturnValue({
    isRTL,
    doLeftAndRightSwapInRTL: true,
    localeIdentifier: isRTL ? 'ar_SA' : 'en_US',
  });
};

describe('detectTextDirection', () => {
  beforeEach(() => {
    jest.spyOn(I18nManager, 'getConstants').mockName('getConstants');
    mockUIDirection(false);
  });

  describe('Arabic-first text', () => {
    it.each([['كتاب الأصدقاء'], ['مليون من الأفكار'], ['سلسلة روايات #1']])(
      'returns rtl regardless of UI direction for %p',
      text => {
        mockUIDirection(false);
        expect(detectTextDirection(text)).toBe('rtl');

        mockUIDirection(true);
        expect(detectTextDirection(text)).toBe('rtl');
      },
    );

    it('returns rtl when leading punctuation precedes Arabic', () => {
      expect(detectTextDirection('«كتاب» مميز')).toBe('rtl');
      expect(detectTextDirection('!!! رواية عربية')).toBe('rtl');
    });

    it('returns rtl when emoji and digits precede Arabic', () => {
      expect(detectTextDirection('📚 123 - قلبان و钩')).toBe('rtl');
    });
  });

  describe('English-first text', () => {
    it.each([['The Beginning After The End'], ['Re:Monster - Vol. 12']])(
      'returns ltr regardless of UI direction for %p',
      text => {
        mockUIDirection(false);
        expect(detectTextDirection(text)).toBe('ltr');

        mockUIDirection(true);
        expect(detectTextDirection(text)).toBe('ltr');
      },
    );

    it('returns ltr for non-Latin strong LTR scripts', () => {
      expect(detectTextDirection('普通の小説')).toBe('ltr');
      expect(detectTextDirection('Обычный роман')).toBe('ltr');
      expect(detectTextDirection('Ελληνικό μυθιστόρημα')).toBe('ltr');
    });
  });

  describe('mixed text', () => {
    it('follows the first strong character, not the dominant script', () => {
      expect(detectTextDirection('عربي novel 123')).toBe('rtl');
      expect(detectTextDirection('English نص عربي')).toBe('ltr');
      expect(detectTextDirection('普通 小説 Arabic')).toBe('ltr');
    });
  });

  describe('neutral-only text', () => {
    it.each([['123 - 456'], ['...!!!???'], ['— — —'], ['#@$%&*']])(
      '%p follows the UI locale direction',
      text => {
        mockUIDirection(false);
        expect(detectTextDirection(text)).toBe('ltr');

        mockUIDirection(true);
        expect(detectTextDirection(text)).toBe('rtl');
      },
    );

    it('resolves Arabic-Indic digits to rtl (inside the Arabic block)', () => {
      mockUIDirection(false);
      expect(detectTextDirection('١٢٣٤')).toBe('rtl');

      mockUIDirection(true);
      expect(detectTextDirection('١٢٣٤')).toBe('rtl');
    });

    it('treats Western digits as neutral', () => {
      mockUIDirection(false);
      expect(detectTextDirection('2024')).toBe('ltr');

      mockUIDirection(true);
      expect(detectTextDirection('2024')).toBe('rtl');
    });
  });

  describe('empty and missing text', () => {
    it.each([[undefined], [null], ['']])('%p follows the UI locale', empty => {
      mockUIDirection(false);
      expect(detectTextDirection(empty as string)).toBe('ltr');

      mockUIDirection(true);
      expect(detectTextDirection(empty as string)).toBe('rtl');
    });
  });
});
