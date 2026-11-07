// htmlToWorText — LNReader sanitized HTML → wor plain text.
// Covers the contract buildWorSectionHTML relies on: paragraph breaks from
// block tags, <br> → \n, <img> on its own line (passed through unescaped),
// entity decoding (named + numeric) and 3+ newline collapsing.

import { htmlToWorText } from '../htmlToWorText';

describe('htmlToWorText', () => {
  it('converts <p> blocks into paragraph breaks (\\n\\n)', () => {
    expect(htmlToWorText('<p>السطر الأول</p><p>السطر الثاني</p>')).toBe(
      'السطر الأول\n\nالسطر الثاني',
    );
  });

  it('keeps plain text without tags intact', () => {
    expect(htmlToWorText('نص عادي بدون وسوم')).toBe('نص عادي بدون وسوم');
  });

  it('converts <br> into a single newline', () => {
    expect(htmlToWorText('سطر أول<br>سطر ثانٍ<br/><br>سطر ثالث')).toBe(
      'سطر أول\nسطر ثانٍ\n\nسطر ثالث',
    );
  });

  it('emits each <img> as its own unescaped line with src + alt only', () => {
    const out = htmlToWorText(
      '<p>قبل</p><img src="https://example.com/a.jpg" alt="صورة" loading="lazy" decoding="async" data-x="1"><p>بعد</p>',
    );
    expect(out).toContain('قبل');
    expect(out).toContain('<img src="https://example.com/a.jpg" alt="صورة">');
    expect(out).toContain('بعد');
    // the image line is NOT escaped into &lt;img …
    expect(out).not.toContain('&lt;img');
    // extra attributes are dropped
    expect(out).not.toContain('data-x');
    // its own line: newlines both sides
    expect(out).toMatch(/\n<img [^\n]+>\n/);
  });

  it('escapes double quotes inside img attributes so the tag stays well-formed', () => {
    const out = htmlToWorText('<img src=\'https://x/"y".jpg\'>');
    expect(out).toBe('<img src="https://x/&quot;y&quot;.jpg" alt="">');
  });

  it('decodes named and numeric HTML entities while reading text', () => {
    expect(htmlToWorText('<p>&amp; &lt; &gt; &quot; &#39;</p>')).toBe(
      '& < > " \'',
    );
    expect(htmlToWorText('<p>&#1602;&#1604;</p>')).toBe('قل');
  });

  it('collapses 3+ newlines down to paragraph breaks', () => {
    expect(htmlToWorText('<p>أ</p><br><br><br><br><p>ب</p>')).toBe('أ\n\nب');
  });

  it('strips non-img tags but keeps their text', () => {
    expect(htmlToWorText('<div><span>مهم</span> <b>جداً</b></div>')).toBe(
      'مهم جداً',
    );
  });

  it('never leaks <style> / <script> / <title> contents', () => {
    const out = htmlToWorText(
      '<head><title>ليس محتوى</title><style>.x{color:red}</style></head><body><p>المحتوى</p><script>alert(1)</script></body>',
    );
    expect(out).toBe('المحتوى');
  });

  it('trims surrounding whitespace', () => {
    expect(htmlToWorText('   <p>مرحبا</p>   ')).toBe('مرحبا');
  });
});
