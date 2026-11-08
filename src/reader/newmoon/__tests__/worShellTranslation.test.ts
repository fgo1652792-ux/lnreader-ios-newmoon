// src/reader/newmoon/__tests__/worShellTranslation.test.ts
//
// Regression gate for the translation bridge inside the frozen reader
// document: the shell must carry the full translation protocol AND the
// generated <script> must still be syntactically valid JavaScript (a broken
// shell bricks the whole reader — this parses the actual output).

import buildWorShell from '../worShell';

const build = () =>
  buildWorShell({
    safeTop: 47,
    safeBottom: 21,
    novelTitle: 'رواية اختبار',
    novelCover: '',
    userName: '',
    userRole: '',
    initialSettings: {},
    fontsBase: '/assets/fonts',
  });

const extractMainScript = (html: string): string => {
  // the LAST <script> block is the bridge/bridge-extension bundle
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1][1];
};

describe('worShell translation protocol (Zeus port)', () => {
  it('ships the translation card markup', () => {
    const html = build();
    expect(html).toContain('id="worTransCard"');
    expect(html).toContain('data-wor-trans-action="translate"');
    expect(html).toContain('data-wor-trans-action="toggle"');
    expect(html).toContain('data-wor-trans-action="stop"');
    expect(html).toContain('data-wor-trans-action="resume"');
    expect(html).toContain('data-wor-trans-action="settings"');
  });

  it('ships the shell-side translation state machine', () => {
    const html = build();
    // TRT state + all receive branches + visibility reporter
    expect(html).toContain('TRT = {');
    expect(html).toContain("kind === 'transStart'");
    expect(html).toContain("kind === 'transApply'");
    expect(html).toContain("kind === 'transShow'");
    expect(html).toContain("kind === 'transState'");
    expect(html).toContain('transReportVisible');
    // originals are captured before overwrite and restored verbatim
    expect(html).toContain('transCaptureOriginal');
    expect(html).toContain('transRestoreItem');
    // translated text goes in as plain text — never innerHTML
    expect(html).toContain('node.textContent = text');
    // section unload/restore re-paints translated sections
    expect(html).toContain('transPaintSection(num)');
  });

  it('generated script is valid JavaScript (parse check)', () => {
    const html = build();
    const script = extractMainScript(html);
    expect(() => {
       
      new Function(script);
    }).not.toThrow();
  });

  it('page-translation resource is valid JavaScript (parse check)', () => {
    const {
      MOON_PAGE_TRANSLATE_SOURCE,
    } = require('../../../services/translation/resources/moonPageTranslateSource');
    expect(MOON_PAGE_TRANSLATE_SOURCE).toContain('globalThis.moonTranslate');
    expect(() => {
       
      new Function(MOON_PAGE_TRANSLATE_SOURCE);
    }).not.toThrow();
  });
});
