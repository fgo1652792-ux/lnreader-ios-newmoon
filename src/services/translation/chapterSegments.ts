// src/services/translation/chapterSegments.ts
//
// Bridge between the New Moon reader chapter pipeline and the translation
// engine. The reader renders a chapter as ONE <section class="wor-chapter-sec"
// data-ch="{wNum}"> containing a title block and one <p> per non-empty line
// (see src/reader/newmoon/sections.ts buildWorSectionHTML). Translation
// segments must line up 1:1 with those DOM nodes without ever rebuilding the
// document, so segment ids ARE the paragraph indices within the section:
//
//   p0  → the chapter title block (Zeus's ReaderTranslation treats the title
//         as index 0 of the originals array — same convention here)
//   p1..pN → the section's <p> list in DOM order (image paragraphs keep their
//         slot but are skipped as segments — they have no text to translate)
//
// The shell's transApply handler resolves these ids against the section DOM;
// the original text of every paragraph stays inside the shell until restored.

import { TranslationSegment } from './types';

export type ChapterSegmentInput = {
  /** The wor text produced by htmlToWorText + replaceTermsInText (the exact
   *  string buildWorSectionHTML consumes as sec.content). */
  worText: string;
  title: string;
};

export type ChapterSegments = {
  /** Ordered segments (title first), each id = `p{paragraphIndex}`. */
  segments: TranslationSegment[];
  /** paragraphIndex → original line for shell bookkeeping. */
  paragraphCount: number;
  /** Image paragraph indices (never translatable). */
  imageParagraphs: number[];
};

/** Mirror of sections.ts IMAGE_LINE_RE — an <img> line, not text. */
const IMAGE_LINE_RE = /^\s*<img\s/i;

export const buildChapterSegments = ({
  worText,
  title,
}: ChapterSegmentInput): ChapterSegments => {
  const lines = String(worText || '')
    .split('\n')
    .filter(line => line.trim() !== '');

  const segments: TranslationSegment[] = [];
  const imageParagraphs: number[] = [];
  // Paragraph 0 is the title block.
  if (title.trim()) {
    segments.push({ id: 'p0', text: title });
  }
  let paragraphIndex = 1;
  for (const line of lines) {
    if (IMAGE_LINE_RE.test(line)) {
      imageParagraphs.push(paragraphIndex);
    } else {
      segments.push({ id: `p${paragraphIndex}`, text: line });
    }
    paragraphIndex += 1;
  }
  return { segments, paragraphCount: paragraphIndex, imageParagraphs };
};

/** Script-range sniff used for the auto-translate decision (title + first
 *  paragraphs, mirroring Zeus's prefix-8 sampling). */
export const languageSampleOf = (segments: TranslationSegment[]): string =>
  segments
    .slice(0, 9)
    .map(s => s.text)
    .join('\n')
    .slice(0, 3500);
