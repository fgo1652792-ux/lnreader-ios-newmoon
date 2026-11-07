// NewMoonBridge — queue-until-ready protocol across the full WebView
// lifecycle. Pure JS: the WebView ref is faked, only message ORDER and
// SURVIVAL across markReady()/reset() cycles is under test. These semantics
// are load-bearing for the reader reload fix: a real doc reload calls
// reset(), and every message posted after it must be re-queued (none lost,
// none duplicated) while epoch mismatches (shouldResendChapterOnReady)
// drive the ready-handler self-heal.

import {
  NewMoonBridge,
  diffSettingsPatch,
  shouldResendChapterOnReady,
  toInjectableLiteral,
  type ShellCommand,
  type WebViewHandle,
} from '../NewMoonBridge';

const INJECT_PREFIX = 'window.__wor && window.__wor.receive(';
const INJECT_SUFFIX = '); true;';

const makeWebView = () => ({ injectJavaScript: jest.fn() });

const makeBridge = () => {
  const webView = makeWebView();
  const bridge = new NewMoonBridge({
    current: webView as unknown as WebViewHandle,
  });
  const injected = (): ShellCommand[] =>
    webView.injectJavaScript.mock.calls.map(call => {
      const script = call[0] as string;
      expect(script.startsWith(INJECT_PREFIX)).toBe(true);
      expect(script.endsWith(INJECT_SUFFIX)).toBe(true);
      return JSON.parse(
        script.slice(INJECT_PREFIX.length, -INJECT_SUFFIX.length),
      );
    });
  return { bridge, injected };
};

const cmd = (kind: string, extra: Record<string, unknown> = {}): ShellCommand =>
  ({ kind, ...extra }) as ShellCommand;

describe('NewMoonBridge queue protocol', () => {
  it('buffers posts until markReady, then flushes in FIFO order', () => {
    const { bridge, injected } = makeBridge();
    bridge.post(cmd('settings', { fontSize: 20 }));
    bridge.post(cmd('chapters', { total: 5 }));
    expect(injected()).toEqual([]); // nothing injected pre-ready

    bridge.markReady();
    expect(injected().map(m => m.kind)).toEqual(['settings', 'chapters']);
  });

  it('injects immediately once ready', () => {
    const { bridge, injected } = makeBridge();
    bridge.markReady();
    bridge.post(cmd('viewport', { safeTop: 47, safeBottom: 34 }));
    expect(injected()).toEqual([
      { kind: 'viewport', safeTop: 47, safeBottom: 34 },
    ]);
  });

  it('reset() drops queued messages and readiness — post-reset posts are re-queued', () => {
    const { bridge, injected } = makeBridge();
    bridge.post(cmd('settings'));
    bridge.reset();

    // queued message died with the old document — a pre-ready post after the
    // reset must re-queue (ready was cleared), and markReady must NOT flush
    // the dropped settings message
    bridge.post(cmd('chapter', { number: 3 }));
    expect(injected()).toEqual([]);
    bridge.markReady();
    expect(injected()).toEqual([{ kind: 'chapter', number: 3 }]);
  });

  it('simulated reload: no message lost, none duplicated', () => {
    const { bridge, injected } = makeBridge();

    // doc 1: ready, deliver a chapter
    bridge.markReady();
    bridge.post(cmd('chapter', { number: 1 }));

    // reload → reset() (onLoadStart), new doc boots, bridge re-armed
    bridge.reset();
    bridge.post(cmd('settings', { fontSize: 22 }));
    bridge.markReady();
    bridge.post(cmd('viewport', { safeTop: 0, safeBottom: 0 }));

    const kinds = injected().map(m => m.kind);
    expect(kinds).toEqual(['chapter', 'settings', 'viewport']);
    // chapter injected exactly once across the whole lifecycle
    expect(kinds.filter(k => k === 'chapter')).toHaveLength(1);
  });

  it('markReady flushes the queue exactly once (idempotent readiness)', () => {
    const { bridge, injected } = makeBridge();
    bridge.post(cmd('chapters', { total: 2 }));
    bridge.markReady();
    bridge.markReady(); // second call must not re-flush
    expect(injected()).toEqual([{ kind: 'chapters', total: 2 }]);
  });

  it('no-op when the WebView ref is empty (screen tearing down)', () => {
    const bridge = new NewMoonBridge({ current: null });
    expect(() => {
      bridge.post(cmd('settings'));
      bridge.markReady();
    }).not.toThrow();
  });
});

describe('shouldResendChapterOnReady (reload self-heal decision)', () => {
  it('resends when the current doc epoch never got a chapter', () => {
    expect(shouldResendChapterOnReady(0, 1)).toBe(true); // fresh doc, nothing sent
    expect(shouldResendChapterOnReady(3, 4)).toBe(true); // chapter belongs to a dead doc
  });

  it('never resends when the chapter was delivered in the same epoch', () => {
    expect(shouldResendChapterOnReady(2, 2)).toBe(false); // queued pre-ready
    expect(shouldResendChapterOnReady(7, 7)).toBe(false); // normal boot ordering
  });

  it('0/0 (no doc booted, nothing sent) stays quiet — safe default', () => {
    expect(shouldResendChapterOnReady(0, 0)).toBe(false);
  });
});

describe('toInjectableLiteral (bridge transport safety)', () => {
  it('keeps U+2028/U+2029 from splitting the injected script', () => {
    const literal = toInjectableLiteral({ kind: 'chapter', title: 'أ\u2028ب' });
    expect(literal).toContain('\\u2028');
    expect(JSON.parse(literal).title).toBe('أ\u2028ب');
  });
});

describe('diffSettingsPatch (focus-adopt diff after the settings screen)', () => {
  it('reports only the keys whose value changed', () => {
    const prev = {
      fontSize: 18,
      bgColor: '#000000',
      continuousMode: false,
      fontWeight: 400,
    };
    const next = {
      fontSize: 22,
      bgColor: '#000000', // unchanged
      continuousMode: true,
      fontWeight: 400, // unchanged
    };
    expect(diffSettingsPatch(next, prev)).toEqual({
      fontSize: 22,
      continuousMode: true,
    });
  });

  it('returns an empty patch when the reader is already in sync', () => {
    const settings = { fontSize: 18, bgColor: '#111111', keepAwake: true };
    expect(diffSettingsPatch(settings, { ...settings })).toEqual({});
  });

  it('compares with Object.is semantics (0/-0, NaN)', () => {
    expect(diffSettingsPatch({ n: 0 }, { n: -0 })).toEqual({ n: 0 });
    expect(diffSettingsPatch({ n: NaN }, { n: NaN })).toEqual({});
  });

  it('treats string/number coercions as changes (strict equality)', () => {
    // '18' !== 18 — the settings screen writes the same types the reader
    // stores, but a corrupted store value must still be reported and adopted.
    expect(diffSettingsPatch({ fontSize: 18 }, { fontSize: '18' })).toEqual({
      fontSize: 18,
    });
  });
});
