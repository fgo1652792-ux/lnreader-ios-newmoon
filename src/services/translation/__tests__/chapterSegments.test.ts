// src/services/translation/__tests__/chapterSegments.test.ts
// The segment↔DOM contract: paragraph indices from buildChapterSegments must
// line up 1:1 with the shell's section > p list (images keep their slot).

import { buildChapterSegments, languageSampleOf } from '../chapterSegments';

describe('buildChapterSegments', () => {
  it('maps the title to p0 and text lines to sequential p indices', () => {
    const result = buildChapterSegments({
      worText: 'السطر الأول\nالسطر الثاني\nالسطر الثالث',
      title: 'الفصل الأول',
    });
    expect(result.segments[0]).toEqual({ id: 'p0', text: 'الفصل الأول' });
    expect(result.segments.map(s => s.id)).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(result.paragraphCount).toBe(4);
    expect(result.imageParagraphs).toEqual([]);
  });

  it('image lines keep their paragraph slot but produce no segment', () => {
    const result = buildChapterSegments({
      worText: 'قبل الصورة\n<img src="https://x/y.jpg" />\nبعد الصورة',
      title: 'العنوان',
    });
    expect(result.segments.map(s => s.id)).toEqual(['p0', 'p1', 'p3']);
    expect(result.imageParagraphs).toEqual([2]);
    expect(result.paragraphCount).toBe(4);
  });

  it('skips empty lines exactly like buildWorSectionHTML', () => {
    // buildWorSectionHTML filters line.trim() === '' before rendering — the
    // segment builder must apply the SAME filter or indices drift.
    const result = buildChapterSegments({
      worText: 'أ\n\n\nب',
      title: 'ت',
    });
    expect(result.segments.map(s => s.id)).toEqual(['p0', 'p1', 'p2']);
  });

  it('empty title produces no p0 segment', () => {
    const result = buildChapterSegments({ worText: 'نص', title: '' });
    expect(result.segments.map(s => s.id)).toEqual(['p1']);
  });
});

describe('languageSampleOf', () => {
  it('samples the title + opening paragraphs (Zeus prefix-8)', () => {
    const result = buildChapterSegments({
      worText: Array.from({ length: 30 }, (_, i) => `Paragraph line ${i}`).join(
        '\n',
      ),
      title: 'Chapter One',
    });
    const sample = languageSampleOf(result.segments);
    expect(sample).toContain('Chapter One');
    expect(sample).toContain('Paragraph line 0');
    expect(sample).not.toContain('Paragraph line 29');
    expect(sample.length).toBeLessThanOrEqual(3500);
  });
});
