import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import WebView, { WebViewNavigation } from 'react-native-webview';
import type { WebViewProgressEvent } from 'react-native-webview/lib/WebViewTypes';
import { ProgressBar } from 'react-native-paper';

import { getPlugin } from '@plugins/pluginManager';
import { useBackHandler } from '@hooks';
import { useTheme } from '@hooks/persisted';
import { WebviewScreenProps } from '@navigators/types';
import { getUserAgent } from '@hooks/persisted/useUserAgent';
import { resolveUrl } from '@services/plugin/fetch';
import {
  WEBVIEW_LOCAL_STORAGE,
  WEBVIEW_SESSION_STORAGE,
  store,
} from '@plugins/helpers/storage';
import Appbar from './components/Appbar';
import Menu from './components/Menu';
import {
  PageTranslation,
  type PageTranslationState,
} from '@services/translation/pageTranslation';
import { MOON_PAGE_TRANSLATE_SOURCE } from '@services/translation/resources/moonPageTranslateSource';
import { effectivePrefs } from '@services/translation/prefs';

type StorageData = {
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
};

const WebviewScreen = ({ route, navigation }: WebviewScreenProps) => {
  const { name, url, pluginId, isNovel } = route.params;
  const isSave = getPlugin(pluginId)?.webStorageUtilized;
  const uri = useMemo(
    () => resolveUrl(pluginId, url, isNovel),
    [isNovel, pluginId, url],
  );
  const userAgent = useMemo(() => getUserAgent(), []);

  const theme = useTheme();
  const webViewRef = useRef<WebView<object> | null>(null);

  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState(name || '');
  const [currentUrl, setCurrentUrl] = useState(uri);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [tempData, setTempData] = useState<StorageData>();
  const [menuVisible, setMenuVisible] = useState(false);
  // Page translation (Zeus engine) — offered banner + running status.
  const [pageTrans, setPageTrans] = useState<PageTranslationState>(() => ({
    offered: false,
    running: false,
    translated: false,
    sourceLanguage: '',
    completed: 0,
    reused: 0,
  }));
  const pagePrefs = useMemo(() => effectivePrefs(), []);
  const pageTranslationRef = useRef<PageTranslation | null>(null);
  if (!pageTranslationRef.current) {
    pageTranslationRef.current = new PageTranslation(webViewRef, pagePrefs);
  }
  useEffect(() => {
    const controller = pageTranslationRef.current;
    controller!.stateListener = state => setPageTrans(state);
    return () => {
      controller!.stateListener = null;
      controller!.stop();
    };
  }, []);

  const handleNavigation = (e: WebViewNavigation) => {
    if (!e.loading) {
      setTitle(e.title);
    }
    setCurrentUrl(e.url);
    setCanGoBack(e.canGoBack);
    setCanGoForward(e.canGoForward);
  };

  const handleLoadProgress = useCallback(
    ({ nativeEvent }: WebViewProgressEvent) => {
      const next = nativeEvent.progress;
      // Progress is reported continuously: re-rendering the screen (and with
      // it the WebView element) for sub-percent changes is wasted work.
      setProgress(current =>
        next === 1 || Math.abs(next - current) >= 0.05 ? next : current,
      );
    },
    [],
  );

  const saveData = () => {
    if (pluginId && tempData && isSave) {
      store.set(
        pluginId + WEBVIEW_LOCAL_STORAGE,
        JSON.stringify(tempData?.localStorage || {}),
      );
      store.set(
        pluginId + WEBVIEW_SESSION_STORAGE,
        JSON.stringify(tempData?.sessionStorage || {}),
      );
    }
  };

  useBackHandler(() => {
    if (menuVisible) {
      setMenuVisible(false);
      return true;
    }
    if (canGoBack) {
      webViewRef.current?.goBack();
      return true;
    }
    saveData();
    return false;
  });

  const injectJavaScriptCode =
    'window.ReactNativeWebView.postMessage(JSON.stringify({localStorage, sessionStorage}))';

  /**
   * Message dispatcher — the translation channel has its own envelope so the
   * existing plugin-storage handler keeps working unchanged:
   *   { __moonTranslationResult: true, … } → inject-result resolver
   *   { __moonTranslation: true, … }       → page translation controller
   *   anything else                        → plugin storage snapshot
   */
  const handleOnMessage = useCallback(
    ({ nativeEvent }: { nativeEvent: { data: string } }) => {
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(nativeEvent.data) as Record<string, unknown>;
      } catch {
        return;
      }
      if (!parsed) return;
      if (parsed.__moonTranslationResult === true) {
        const ticket = parsed.__ticket;
        if (typeof ticket === 'string') {
          PageTranslation.pending.get(ticket)?.(
            parsed as {
              __ticket?: string;
              __result?: unknown;
              __error?: string;
            },
          );
          PageTranslation.pending.delete(ticket);
        }
        return;
      }
      if (parsed.__moonTranslation === true) {
        pageTranslationRef.current?.handleMessage(
          parsed as { kind?: string; sample?: string; lang?: string },
        );
        return;
      }
      setTempData(parsed as StorageData);
    },
    [],
  );

  // A new `source` reloads the page, so keep it stable across progress updates.
  const source = useMemo(() => ({ uri }), [uri]);

  // Fresh document → reset the page-translation session (Zeus
  // navigationStarted). The injected script re-announces itself with `ready`.
  const handleLoadStart = useCallback(
    (event: { nativeEvent: { url?: string } }) => {
      pageTranslationRef.current?.navigationStarted(
        event.nativeEvent?.url || currentUrl,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <>
      <Appbar
        title={title}
        currentUrl={currentUrl}
        theme={theme}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        webView={webViewRef}
        setMenuVisible={setMenuVisible}
        goBack={() => {
          saveData();
          navigation.goBack();
        }}
      />
      <ProgressBar
        color={theme.primary}
        progress={Math.round(1000 * progress) / 1000}
        visible={progress !== 1}
      />
      <WebView<object>
        userAgent={userAgent}
        ref={webViewRef}
        source={source}
        setDisplayZoomControls={true}
        setBuiltInZoomControls={false}
        setSupportMultipleWindows={false}
        injectedJavaScript={`${MOON_PAGE_TRANSLATE_SOURCE}\n;\n${injectJavaScriptCode}`}
        onNavigationStateChange={handleNavigation}
        onLoadProgress={handleLoadProgress}
        onLoadStart={handleLoadStart}
        onMessage={handleOnMessage}
      />
      {pageTrans.offered && !pageTrans.translated ? (
        <View style={[styles.offerBanner, { backgroundColor: theme.surface2 }]}>
          <Text
            style={[styles.offerText, { color: theme.onSurface }]}
            numberOfLines={1}
          >
            هذه الصفحة بلغة أخرى — ترجمتها؟
          </Text>
          <Pressable
            onPress={() => {
              void pageTranslationRef.current?.translate();
            }}
            style={[styles.offerButton, { backgroundColor: theme.primary }]}
            hitSlop={8}
          >
            <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>
              ترجمة
            </Text>
          </Pressable>
          <Pressable
            onPress={() => pageTranslationRef.current?.dismiss()}
            hitSlop={8}
          >
            <Text style={{ color: theme.onSurfaceVariant }}>تجاهل</Text>
          </Pressable>
        </View>
      ) : null}
      {pageTrans.running || pageTrans.translated ? (
        <View pointerEvents="none" style={styles.statusPill}>
          <Text style={styles.statusPillText}>
            {pageTrans.running
              ? `جارٍ ترجمة الصفحة… ${pageTrans.completed}`
              : `مترجمة (${pageTrans.completed} مقطعًا)`}
          </Text>
        </View>
      ) : null}
      {menuVisible ? (
        <Menu
          theme={theme}
          currentUrl={currentUrl}
          webView={webViewRef}
          setMenuVisible={setMenuVisible}
          onTranslate={() => {
            void pageTranslationRef.current?.translate();
          }}
          onRestore={() => {
            void pageTranslationRef.current?.restore();
          }}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  offerBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  offerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  offerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPill: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

export default WebviewScreen;
