// Port of TextTranslationService.decodeEntities — Google Cloud returns
// HTML-escaped translations when format=text; Zeus unescapes the fixed set
// plus numeric/hex references without any HTML parsing.

const FIXED: [string, string][] = [
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&apos;', "'"],
  ['&amp;', '&'],
];

export const decodeEntities = (text: string): string => {
  let result = text;
  for (const [encoded, value] of FIXED) {
    result = result.split(encoded).join(value);
  }
  return result.replace(/&#(x[0-9A-Fa-f]+|[0-9]+);/g, (whole, code: string) => {
    const number = code.startsWith('x')
      ? parseInt(code.slice(1), 16)
      : parseInt(code, 10);
    if (Number.isNaN(number) || number < 0 || number > 0x10ffff) return whole;
    try {
      return String.fromCodePoint(number);
    } catch {
      return whole;
    }
  });
};
