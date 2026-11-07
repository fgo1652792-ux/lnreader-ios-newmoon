// lnreader-ios/src/screens/settings/SettingsReaderScreen/components/WorPreview.tsx
//
// Live reader preview for the settings screen — runs the REAL New-moon engine
// shell (buildWorShell) in a WebView and pushes a sample Arabic chapter
// through the SAME pipeline/message shapes as NewMoonReaderScreen
// (buildWorSectionHTML → bridge `chapter` message, settings via bridge
// `settings` messages).
//
// The rule that matters: the WebView document is built ONCE per mount and is
// NEVER reloaded. Every settings change is applied by the shell itself from
// the bridge payload; structural changes (quote/mark styles baked into the
// section HTML) only re-send the chapter section, exactly like the real
// reader's needsStructuralRebuild path.

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildWorShell } from '../../../../reader/newmoon/worShell';
import { buildWorSectionHTML } from '../../../../reader/newmoon/sections';
import {
  NewMoonBridge,
  parseShellEvent,
  type WebViewHandle,
} from '@screens/reader/newmoon/NewMoonBridge';
import {
  needsStructuralRebuild,
  type WorReaderSettings,
} from '@screens/reader/newmoon/NewMoonAdapter';
import { getReaderAssetsPrefix } from '@utils/readerAssets';
import { getString } from '@i18n/translations';

type WebViewMessage = { nativeEvent: { data: string } };

interface WorPreviewProps {
  settings: WorReaderSettings;
  /** Shell dock changed a setting inside the preview → mirror it upward. */
  onShellPatch?: (patch: Partial<WorReaderSettings>) => void;
}

/** Multi-paragraph Arabic sample — exercises dialogue, brackets and bold. */
const SAMPLE_CONTENT = [
  'في قاع البحر حيث لا يصل ضوء الشمس، تبدأ الحكاية.',
  'قالت ليلى: «ما رأيك في هذا المكان؟»',
  '[ملاحظة المؤلف] هذه معاينة حية لمحرك القراءة الجديد.',
  'يمكنك تغيير حجم الخط وتباعد الأسطر والوزن من الأدوات بالأسفل، وستنتقل التغييرات إلى هذه الصفحة فورًا دون إعادة تحميل.',
  '**النص العريض** يظهر هكذا عندما تفعّل تنسيق الماركداون.',
  'وتُلوَّن الحوارات تلقائيًا عند اختيار نمط علامات الاقتباس.',
  'جرّب تبديل الاتجاه بين RTL و LTR ولاحظ الفرق في محاذاة الفقرات.',
  'كل إعداد تكتبه هنا يُحفظ فورًا ويُطبَّق على القارئ الحقيقي عند فتح أي فصل.',
].join('\n');

const WorPreview = ({ settings, onShellPatch }: WorPreviewProps) => {
  const webViewRef = useRef<WebViewHandle | null>(null);
  const bridgeRef = useRef<NewMoonBridge | null>(null);
  if (bridgeRef.current == null) {
    bridgeRef.current = new NewMoonBridge(webViewRef);
  }

  const insets = useSafeAreaInsets();
  // Safe areas are read ONCE at mount — the shell document never rebuilds.
  const [mountedInsets] = useState(() => ({
    top: insets.top,
    bottom: insets.bottom,
  }));

  // ------------------------------------------------- shell html (once) ---
  // Same call shape as NewMoonReaderScreen's shellHtml useMemo.
  const [shellHtml] = useState(() =>
    buildWorShell({
      safeTop: mountedInsets.top,
      safeBottom: mountedInsets.bottom,
      novelTitle: getString('newMoon.settingsPreviewNovelTitle'),
      novelCover: '',
      userName: '',
      userRole: '',
      initialSettings: { ...settings },
      fontsBase: getReaderAssetsPrefix(),
    }),
  );
  const assetsUriPrefix = getReaderAssetsPrefix();

  // ---------------------------------------------------- shell senders ---
  const buildSampleSectionHtml = useCallback(
    (S: WorReaderSettings) =>
      buildWorSectionHTML(
        {
          number: 1,
          title: getString('newMoon.settingsPreviewChapterTitle'),
          content: SAMPLE_CONTENT,
          copyrightStyles: null,
        },
        0,
        // `colored` is the words-store pipeline input; the preview has none.
        { ...S, colored: [] },
      ),
    [],
  );

  const sendSampleChapter = useCallback(
    (S: WorReaderSettings) => {
      bridgeRef.current?.post({
        kind: 'chapter',
        number: 1,
        title: getString('newMoon.settingsPreviewChapterTitle'),
        novelTitle: getString('newMoon.settingsPreviewNovelTitle'),
        total: 1,
        percent: '100%',
        percentValue: 100,
        hasPrev: false,
        hasNext: false,
        html: buildSampleSectionHtml(S),
        commentCount: 0,
        showCommentsButton: false,
        authorCard: null,
        isFavorite: false,
        scrollOffset: 0,
        keepScroll: false,
      });
    },
    [buildSampleSectionHtml],
  );

  // ------------------------------------------------- settings pipeline ---
  /** Previous settings for the structural-rebuild decision. */
  const previousSettingsRef = useRef<WorReaderSettings | null>(null);

  useEffect(() => {
    const previous = previousSettingsRef.current;
    previousSettingsRef.current = settings;

    // The bridge buffers every message until the shell fires `ready`, so
    // posting on mount AND on every change is the single uniform path:
    // 'ready' → queued settings + chapter are flushed in order.
    bridgeRef.current?.post({
      kind: 'settings',
      settings: { ...settings },
    });

    if (previous && needsStructuralRebuild(settings, previous)) {
      // Structural keys changed → re-send the section HTML. NEVER a reload.
      sendSampleChapter(settings);
    } else if (!previous) {
      // First mount: always seed the document with the sample chapter.
      sendSampleChapter(settings);
    }
  }, [settings, sendSampleChapter]);

  // ------------------------------------------------------ shell events ---
  const handleOnMessage = useCallback(
    (event: WebViewMessage) => {
      const shellEvent = parseShellEvent(event.nativeEvent.data);
      if (!shellEvent) {
        return;
      }
      switch (shellEvent.t) {
        case 'ready':
          bridgeRef.current?.markReady();
          break;
        case 'settings': {
          // The preview's own dock controls changed a setting — mirror it
          // upward so the tabs stay in sync (same flow as the real reader).
          const patch = shellEvent.patch;
          if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
            onShellPatch?.(patch as Partial<WorReaderSettings>);
          }
          break;
        }
        default:
          // scroll/tts/toast/backPress/… — nothing to do in the preview.
          break;
      }
    },
    [onShellPatch],
  );

  return (
    <View testID="wor-reader-preview" collapsable={false} style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ baseUrl: assetsUriPrefix, html: shellHtml }}
        style={styles.webView}
        originWhitelist={['*']}
        mixedContentMode="always"
        domStorageEnabled
        allowFileAccess
        onMessage={handleOnMessage}
      />
    </View>
  );
};

export default WorPreview;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
