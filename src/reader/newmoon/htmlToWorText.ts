// lnreader-ios/src/reader/newmoon/htmlToWorText.ts
// Converts LNReader's sanitized chapter HTML (output of
// src/screens/reader/utils/sanitizeChapterText.ts) into the plain-text,
// newline-separated "wor text" the New-moon-2 engine consumes:
//
//   <br>            → \n
//   </p> / blocks   → paragraph breaks (\n\n)
//   <img src="…">   → kept as its OWN line `<img src="…" alt="…">` (the single
//                     tag buildWorSectionHTML passes through unescaped —
//                     documented exception; the HTML was already sanitized)
//   all other tags  → stripped, text kept
//   entities        → decoded (named + decimal/hex numeric references)
//   3+ newlines     → collapsed to \n\n
//
// Dependency-free on purpose: the input is already sanitized well-formed
// HTML, so a strict ordered pass is deterministic, fast, and works the same
// under Metro and jest (no ESM-only parser packages). Pure and synchronous —
// unit-tested in __tests__/htmlToWorText.test.ts.

/** Tags that force a paragraph break before/after their content. */
const BLOCK_TAGS = 'p|div|section|article|blockquote|h[1-6]|li|tr|figcaption';

/** Tags whose entire content must never leak into the reading surface. */
const SKIP_BLOCK = /<(head|style|script|template)[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** self-closing / paired skip tags that may appear without a wrapper head. */
const SKIP_LEAF = /<(style|script|template)[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi;

const HTML_COMMENT = /<!--[\s\S]*?-->/g;

const ANY_TAG = /<[^>]+>/g;

/** <br>, <br/>, <br /> variants. */
const BR_TAG = /<br\s*\/?>/gi;

const IMG_TAG = /<img\b([^>]*)>/gi;

/** Attribute extractor: "…" | '…' | bare value. */
const extractAttr = (attrs: string, name: string): string => {
  const re = new RegExp(
    `${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const m = re.exec(attrs);
  if (!m) return '';
  return m[1] ?? m[2] ?? m[3] ?? '';
};

/** Keep the emitted tag tiny and well-formed: only src + alt survive, and
 * `"` is re-escaped so the tag cannot break out of its own attributes. */
const normalizeImgTag = (attrs: string): string => {
  const src = extractAttr(attrs, 'src').replace(/"/g, '&quot;');
  const alt = extractAttr(attrs, 'alt').replace(/"/g, '&quot;');
  return `\n<img src="${src}" alt="${alt}">\n`;
};

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: '\u00A0',
};

const decodeNumericEntity = (raw: string, isHex: boolean): string => {
  const code = parseInt(raw, isHex ? 16 : 10);
  if (!Number.isFinite(code) || code < 0x20 || code > 0x10ffff) return raw;
  try {
    return String.fromCodePoint(code);
  } catch {
    return raw;
  }
};

/** Decode entities in tag-free text. `&amp;` is decoded last so escaped
 * sequences like `&amp;lt;` survive as the literal text `&lt;`. */
const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => decodeNumericEntity(hex, true))
    .replace(/&#(\d+);/g, (_, dec) => decodeNumericEntity(dec, false))
    .replace(
      /&(quot|apos|lt|gt|nbsp);/g,
      (_, name: string) => NAMED_ENTITIES[name] ?? `&${name};`,
    )
    .replace(/&amp;/g, '&');

export const htmlToWorText = (html: string): string => {
  // Order matters: skip-blocks → img extraction (as protected tokens, so the
  // generic tag-strip pass cannot eat the re-emitted <img>) → br/blocks →
  // strip rest. After the last replace the string is guaranteed tag-free, so
  // entity decoding cannot resurrect a tag.
  const imgTokens: string[] = [];
  let out = html
    .replace(HTML_COMMENT, '')
    .replace(SKIP_BLOCK, '')
    .replace(SKIP_LEAF, '')
    .replace(IMG_TAG, (_, attrs: string) => {
      const token = `\u0000${imgTokens.length}\u0000`;
      imgTokens.push(normalizeImgTag(attrs));
      return token;
    })
    .replace(BR_TAG, '\n')
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n\n')
    .replace(ANY_TAG, '');

  // the string is tag-free from here on — entity decoding is safe
  out = decodeEntities(out).replace(/[ \t]+\n/g, '\n'); // trailing whitespace

  // re-insert normalized <img> lines, THEN collapse runs so each image keeps
  // exactly one blank line above/below regardless of surrounding markup
  out = out
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => imgTokens[Number(i)] ?? '')
    .replace(/\n{3,}/g, '\n\n');

  return out.trim();
};
