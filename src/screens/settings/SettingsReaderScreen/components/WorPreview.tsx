// lnreader-ios/src/screens/settings/SettingsReaderScreen/components/WorPreview.tsx
//
// REAL New Moon reader preview — the settings screen renders the actual
// worShell engine (src/reader/newmoon/worShell.js) in a WebView with a sample
// Arabic/English chapter. Sliders/toggles in the tabs push settings patches
// through the SAME bridge protocol the reader uses, so what you see here is
// exactly what the reader renders. The classic LNReader preview is gone.
//
// Document lifecycle mirrors NewMoonReaderScreen: the shell HTML is built ONCE
// per mount; settings travel as {kind:'settings'} patches (the shell applies
// them without reloading); the preview never re-creates its document when a
// color/font change happens.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getReaderAssetsPrefix } from '@utils/readerAssets';

import buildWorShell from '../../../../reader/newmoon/worShell';
import {
  buildWorSectionHTML,
  isLightColor,
} from '../../../../reader/newmoon/sections';
import {
  NewMoonBridge,
  parseShellEvent,
  type ShellEvent,
  type WebViewHandle,
} from '../../../reader/newmoon/NewMoonBridge';
import {
  getWorSettings,
  useWorSettings,
} from '../../../reader/newmoon/worSettingsStore';

const SAMPLE_TEXT = [
  'في قلب المدينة القديمة، حيث تتشابك الأزقة كخطوط راقية على صفحة من ديوانٍ قديم، بدأت الحكاية.',
  'The moon rose over the quiet hills, and the reader turned the page with a smile.',
  '«هذا حوار عربي تجريبي لمعاينة تنسيق الحوارات» — قالت البطلة وهي تنظر إلى الأفق.',
  '٤. الأرقام العربية تُعرض بجانب النصوص الإنجليزية لاختبار الاتجاه المزدوج.',
  'وفي النهاية، يعود الضوء إلى الصفحة، ويبقى القمر شاهداً على ما تبقى من الحكاية.',
].join('\n\n');

/** Static sample payload — settings travel separately (live patches). */
const SAMPLE_SETTINGS = {
  colored: [] as { src: string; color: string; escaped: string }[],
};

const WorPreview = () => {
  const settings = useWorSettings();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebViewHandle | null>(null);
  const bridgeRef = useRef(new NewMoonBridge(webViewRef));
  const sentChapterRef = useRef(false);

  // Frozen document: mount-time values only (preview safe areas are
  // cosmetic; live insets flow through the settings patch like the reader).
  const shellHtml = useMemo(
    () =>
      buildWorShell({
        safeTop: 0,
        safeBottom: 0,
        novelTitle: 'معاينة قارئ Moon',
        novelCover: '',
        userName: '',
        userRole: '',
        initialSettings: { ...getWorSettings() },
        fontsBase: getReaderAssetsPrefix(),
      }),
    [],
  );
  const assetsUriPrefix = useMemo(() => getReaderAssetsPrefix(), []);

  // Live settings → bridge patch. The shell merges them into S and re-applies
  // the theme/typography — no document reload, ever.
  useEffect(() => {
    bridgeRef.current.post({
      kind: 'settings',
      settings: { ...settings },
    });
  }, [settings]);

  const handleEvent = useCallback((event: ShellEvent) => {
    switch (event.t) {
      case 'ready': {
        bridgeRef.current.markReady();
        if (!sentChapterRef.current) {
          sentChapterRef.current = true;
          const S = { ...getWorSettings(), ...SAMPLE_SETTINGS };
          bridgeRef.current.post({
            kind: 'chapter',
            number: 1,
            title: 'معاينة — الفصل الأول',
            novelTitle: 'معاينة قارئ Moon',
            total: 1,
            percent: '100%',
            percentValue: 100,
            hasPrev: false,
            hasNext: false,
            html: buildWorSectionHTML(
              {
                number: 1,
                title: 'معاينة — الفصل الأول',
                content: SAMPLE_TEXT,
                copyrightStyles: null,
              },
              0,
              S,
            ),
            commentCount: 0,
            showCommentsButton: false,
            authorCard: null,
            isFavorite: false,
            scrollOffset: 0,
            keepScroll: false,
          });
        }
        break;
      }
      case 'nav':
      case 'goto':
      case 'dock':
      case 'exit':
      case 'settings':
      case 'words':
      case 'themeCycle':
        // The preview is a display surface — interactive shell actions are
        // accepted but intentionally inert.
        break;
      default:
        break;
    }
  }, []);

  const handleOnMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const parsed = parseShellEvent(event.nativeEvent?.data);
      if (parsed) {
        handleEvent(parsed);
      }
    },
    [handleEvent],
  );

  const background = useMemo(
    () => (isLightColor(settings.bgColor) ? '#f3efe7' : '#000000'),
    [settings.bgColor],
  );

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <WebView
        ref={webViewRef}
        source={{ baseUrl: assetsUriPrefix, html: shellHtml }}
        style={styles.webview}
        originWhitelist={['*']}
        mixedContentMode="never"
        domStorageEnabled
        onMessage={handleOnMessage}
        pointerEvents="none"
      />
      {/* insets kept for layout parity with the reader (top spacing) */}
      <View style={{ height: insets.top }} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});

export default WorPreview;
