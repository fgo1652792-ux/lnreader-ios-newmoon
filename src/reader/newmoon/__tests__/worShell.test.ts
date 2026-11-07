// buildWorShell — safe-area + viewport contract (string assertions).
//
// The reader screen FREEZES the shell document per mount (rebuilding the
// source prop reloads the WKWebView and destroys reading state). These tests
// pin the two mechanisms that make that freeze safe:
//   1. the boot-time --wor-safe-top/--wor-safe-bottom CSS vars baked into the
//      :root theme (from buildWorShell's safeTop/safeBottom args) and into
//      the shell settings JSON;
//   2. the 'viewport' receive branch that applies LIVE safe-area values as
//      :root CSS custom properties — the only path safe-area changes may
//      take after boot.
// The shell is a JS function returning a full HTML string, so assertions are
// plain string checks — no DOM needed.

import { buildWorShell } from '../worShell';

const build = (overrides: Record<string, unknown> = {}) =>
  buildWorShell({
    safeTop: 47,
    safeBottom: 34,
    novelTitle: 'رواية القمر الجديد',
    novelCover: 'https://example.com/cover.jpg',
    userName: '',
    userRole: '',
    initialSettings: { fontSize: 19, bgColor: '#000000' },
    fontsBase: 'file:///bundle/ReaderAssets',
    ...overrides,
  });

describe('buildWorShell — boot-time safe-area baking', () => {
  it('embeds the mount-time safe-area values in the shell settings JSON', () => {
    const html = build();
    expect(html).toContain('"safeTop":47');
    expect(html).toContain('"safeBottom":34');
  });

  it('wires the boot-time :root CSS vars from those settings', () => {
    // applyTheme() builds the root style string from S.safeTop/S.safeBottom —
    // the boot values only exist at runtime, so the contract here is the
    // wiring expression itself.
    const html = build();
    expect(html).toMatch(
      /'--wor-safe-top:' \+ \(S\.safeTop \|\| 0\) \+ 'px;'/,
    );
    expect(html).toMatch(
      /'--wor-safe-bottom:' \+ \(S\.safeBottom \|\| 0\) \+ 'px;'/,
    );
  });

  it('the reading layout consumes the vars (live updates take effect)', () => {
    const html = build();
    expect(html).toContain(
      'var(--wor-safe-top, 0px)',
    );
    expect(html).toContain('var(--wor-safe-bottom, 0px)');
  });

  it('defaults safe areas to 0 when the parent passes none', () => {
    const html = buildWorShell({ novelTitle: 'x' });
    expect(html).toContain('"safeTop":0');
    expect(html).toContain('"safeBottom":0');
  });
});

describe("buildWorShell — 'viewport' receive branch (live safe areas)", () => {
  it('registers the viewport command in receive()', () => {
    const html = build();
    expect(html).toContain("kind === 'viewport'");
  });

  it('applies live values as :root CSS custom properties (never a reload)', () => {
    const html = build();
    expect(html).toContain("setProperty('--wor-safe-top'");
    expect(html).toContain("setProperty('--wor-safe-bottom'");
  });

  it('clamps and validates incoming numbers before applying them', () => {
    const html = build();
    // parseInt + NaN guard (malformed message must not produce "NaNpx")
    expect(html).toMatch(/parseInt\(msg\.safeTop, 10\)/);
    expect(html).toMatch(/parseInt\(msg\.safeBottom, 10\)/);
    expect(html).toContain('if (isNaN(vpTop)) vpTop = 0;');
    expect(html).toContain('if (isNaN(vpBottom)) vpBottom = 0;');
    // clamp to a sane px range via the shell's clamp() helper
    expect(html).toContain('clamp(vpTop, 0, 200)');
    expect(html).toContain('clamp(vpBottom, 0, 200)');
  });

  it('stores live values on S so a later applyTheme() keeps them', () => {
    const html = build();
    // applyTheme() rebuilds the root style attribute from S.safeTop/S.safeBottom
    expect(html).toContain('S.safeTop = clamp(vpTop, 0, 200)');
    expect(html).toContain('S.safeBottom = clamp(vpBottom, 0, 200)');
  });
});

describe('buildWorShell — document shape sanity', () => {
  it('emits a full standalone HTML document with the bridge exposed', () => {
    const html = build();
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('window.__wor = { receive: receive');
    expect(html).toContain("send({ t: 'ready' })");
  });
});
