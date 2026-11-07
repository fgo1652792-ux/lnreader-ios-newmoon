import { I18nManager } from 'react-native';

export type TextDirection = 'rtl' | 'ltr';

/**
 * Strong RTL characters: the Hebrew block and the Arabic family of blocks
 * (base, supplement, extended-A and the presentation forms that normalized
 * Arabic text commonly surfaces).
 *
 * Kept as an explicit range set instead of Unicode property escapes so the
 * helper stays dependency-free and Hermes-safe.
 */
const RTL_CHAR_RE =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/**
 * Strong LTR characters for the scripts most likely to appear in novel
 * metadata (Latin incl. extended, Greek, Cyrillic, Armenian, Georgian,
 * Indic, Thai/Lao/Khmer/Myanmar, CJK ideographs, Kana and Hangul).
 *
 * Characters matching neither regex (digits, punctuation, whitespace,
 * symbols, emoji) are bidi-neutral: they never decide the direction and the
 * scan continues past them, mirroring the UBA "first strong character"
 * rule (P2/P3) in a pragmatic form.
 */
const LTR_CHAR_RE =
  /[A-Za-z\u00AA\u00B5\u00BA\u00C0-\u02AF\u0370-\u052F\u0531-\u058A\u10A0-\u10FF\u0900-\u0DFF\u0E00-\u0EFF\u0F00-\u0FFF\u1000-\u109F\u1200-\u137F\u1780-\u17FF\u2E80-\u2EFF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7AF\uF900-\uFAFF]/;

const uiDirection = (): TextDirection =>
  I18nManager.getConstants().isRTL ? 'rtl' : 'ltr';

/**
 * Detect the writing direction of a piece of content text (novel summary,
 * title, chapter name...) that is independent of the app UI language.
 *
 * Returns the direction of the FIRST strong directional character:
 * Arabic/Hebrew -> 'rtl', any other strong script -> 'ltr'. Text with no
 * strong character at all (empty, digits, punctuation only) cannot express
 * a direction and follows the current UI locale via I18nManager.
 */
export const detectTextDirection = (text?: string | null): TextDirection => {
  if (!text) {
    return uiDirection();
  }
  // for..of iterates code points, so surrogate pairs (emoji, rare CJK
  // extensions) are inspected as single characters, not broken halves.
  for (const char of text) {
    if (RTL_CHAR_RE.test(char)) {
      return 'rtl';
    }
    if (LTR_CHAR_RE.test(char)) {
      return 'ltr';
    }
  }
  return uiDirection();
};
