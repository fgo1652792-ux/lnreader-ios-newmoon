// lnreader-ios/src/screens/reader/newmoon/NewMoonBridge.ts
//
// RN ⇄ WebView bridge for the New-moon-2 reader shell.
//
//  OUT (shell → RN):  window.ReactNativeWebView.postMessage(JSON {t: …})
//  IN  (RN → shell):  webviewRef.injectJavaScript(
//                       `window.__wor && window.__wor.receive(${literal}); true;`)
//
// The postToWeb queue pattern is replicated 1:1 from the engine's
// WorReader.tsx:158-178: every outgoing message is buffered until the shell
// fires `ready`, then flushed in order.

import { RefObject } from 'react';
import WebView from 'react-native-webview';

export type ShellEvent = { t: string } & Record<string, unknown>;
export type ShellCommand = { kind: string } & Record<string, unknown>;

/**
 * JSON.stringify output IS a valid JS object literal — except U+2028/U+2029,
 * which are literal line terminators in ES5 strings and would split the
 * injected script. Escape them (RN injectJavaScript runs the string as JS).
 */
export const toInjectableLiteral = (obj: unknown): string =>
  JSON.stringify(obj)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/**
 * Defensive parse of shell → RN messages (mirrors WebViewReader's
 * parseWebViewEvent: a malformed postMessage must never throw into the
 * handler chain).
 */
export const parseShellEvent = (raw: unknown): ShellEvent | null => {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.t === 'string') {
      return parsed as ShellEvent;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * react-native-webview's default generic (P = undefined) collapses
 * `WebViewProps & P` to never, which poisons JSX overload resolution for
 * anyone holding that ref. Every ref in this feature is typed with the
 * explicit `<object>` type argument (same as ChapterContext).
 */
export type WebViewHandle = WebView<object>;

export class NewMoonBridge {
  private ready = false;
  private queue: ShellCommand[] = [];

  constructor(private readonly webViewRef: RefObject<WebViewHandle | null>) {}

  /** Buffer until `ready`, then inject immediately. */
  post = (msg: ShellCommand): void => {
    if (!this.ready) {
      this.queue.push(msg);
      return;
    }
    this.inject(msg);
  };

  /** Shell announced readiness — flush everything buffered so far. */
  markReady = (): void => {
    this.ready = true;
    const pending = this.queue;
    this.queue = [];
    pending.forEach(msg => this.inject(msg));
  };

  /** True when `ready` was seen and not reset since. A load that starts while
   *  this is true is a REAL document reload (content-process kill, etc.) —
   *  the screen resets the bridge so buffered commands are never injected
   *  into a half-booted document (where `window.__wor` does not exist yet and
   *  injectJavaScript silently drops them). */
  isReady = (): boolean => {
    return this.ready;
  };

  /** The WebView remounted (or is going away) — start a fresh queue. */
  reset = (): void => {
    this.ready = false;
    this.queue = [];
  };

  private inject(msg: ShellCommand): void {
    this.webViewRef.current?.injectJavaScript(
      `window.__wor && window.__wor.receive(${toInjectableLiteral(msg)}); true;`,
    );
  }
}
