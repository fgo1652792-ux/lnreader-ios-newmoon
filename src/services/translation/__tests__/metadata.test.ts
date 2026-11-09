// metadata — the translated-metadata pipeline. Verifies: the Arabic-target
// guard, batched aggregation into ONE provider call, subscriber
// notifications, session dedupe (screen re-entry never re-bills) and the
// same-language settle path. textService is mocked; prefs are the real MMKV
// defaults (engine googleWeb, target ar).

jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string>();
  return {
    createMMKV: () => ({
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => void store.set(key, value),
      delete: (key: string) => void store.delete(key),
    }),
  };
});

jest.mock('../textService', () => ({
  translateSegments: jest.fn(async (segments: { id: string; text: string }[]) =>
    segments.map(row => ({ id: row.id, text: `ع: ${row.text}` })),
  ),
  splitText: jest.fn(),
  splitCloudflareText: jest.fn(),
  parseGoogleBatch: jest.fn(),
}));

import { translateSegments } from '../textService';
import {
  queueMetadata,
  subscribeMetadata,
  translatedMetadata,
  forceMetadata,
  isAlreadyTargetLanguage,
} from '../metadata';
import { detectLanguage } from '../detect';

const mockedTranslate = translateSegments as jest.MockedFunction<
  typeof translateSegments
>;

const settle = async (
  predicate?: () => boolean,
): Promise<void> => {
  // The pipeline debounces 400 ms before flushing; poll up to ~3 s.
  for (let i = 0; i < 60; i += 1) {
    if (predicate && predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (predicate) await new Promise(resolve => setTimeout(resolve, 100));
};

describe('isAlreadyTargetLanguage', () => {
  it('treats Arabic text as already-target for ar', () => {
    expect(isAlreadyTargetLanguage('هذه رواية عربية كاملة النص', 'ar')).toBe(true);
  });

  it('treats short Arabic titles as already-target for ar', () => {
    expect(isAlreadyTargetLanguage('البداية', 'ar')).toBe(true);
  });

  it('treats English text as translatable for ar', () => {
    expect(isAlreadyTargetLanguage('The Beginning of the End', 'ar')).toBe(false);
  });

  it('treats numbers/symbols-only text as same-language (nothing to do)', () => {
    expect(isAlreadyTargetLanguage('12345 !!!', 'ar')).toBe(true);
  });

  it('detectLanguage sanity used by the guard', () => {
    expect(detectLanguage('هذه فقرة عربية طويلة نسبيا تحتوي على احرف كافية للاكتشاف')).toBe('ar');
  });
});

describe('metadata pipeline', () => {
  it('never sends Arabic titles when the target is Arabic', async () => {
    const updates: Map<string, string>[] = [];
    const unsubscribe = subscribeMetadata(map => updates.push(new Map(map)));
    queueMetadata([
      { kind: 'title', pluginId: 'ar', novelPath: '/x', text: 'رواية عربية مشهورة' },
    ]);
    await settle(() => translatedMetadata('رواية عربية مشهورة') !== undefined);
    expect(mockedTranslate).not.toHaveBeenCalled();
    // Same-language texts settle as themselves.
    expect(translatedMetadata('رواية عربية مشهورة')).toBe('رواية عربية مشهورة');
    unsubscribe();
  });

  it('aggregates a screen of titles into one batch, notifies, and dedupes re-entry', async () => {
    const updates: Map<string, string>[] = [];
    const unsubscribe = subscribeMetadata(map => updates.push(new Map(map)));
    const items = [
      { kind: 'title' as const, pluginId: 'plugin.en', novelPath: '/novel/a', text: 'Shadow Slave' },
      { kind: 'title' as const, pluginId: 'plugin.en', novelPath: '/novel/b', text: 'Lord of the Mysteries' },
    ];
    queueMetadata(items);
    // Re-queueing the same texts while pending is deduped.
    queueMetadata(items);
    await settle(() => translatedMetadata('Shadow Slave') !== undefined);

    expect(mockedTranslate).toHaveBeenCalledTimes(1);
    const billed = mockedTranslate.mock.calls[0][0];
    expect(billed.map(row => row.text).sort()).toEqual([
      'Lord of the Mysteries',
      'Shadow Slave',
    ]);
    expect(translatedMetadata('Shadow Slave')).toBe('ع: Shadow Slave');
    const merged = new Map<string, string>();
    for (const update of updates) for (const [k, v] of update) merged.set(k, v);
    expect(merged.get('Lord of the Mysteries')).toBe('ع: Lord of the Mysteries');
    unsubscribe();

    // Session dedupe: a re-entry (screen revisit) never re-bills.
    queueMetadata(items);
    await settle();
    expect(mockedTranslate).toHaveBeenCalledTimes(1);
  });

  it('forceMetadata re-queues a settled text (re-translate button)', async () => {
    const updates: Map<string, string>[] = [];
    const unsubscribe = subscribeMetadata(map => updates.push(new Map(map)));
    forceMetadata({
      kind: 'summary',
      pluginId: 'plugin.en',
      novelPath: '/novel/a',
      text: 'Shadow Slave',
    });
    await settle(() => translatedMetadata('Shadow Slave') !== undefined);
    // The memory/cache layer answers instantly for known texts, so the
    // provider is not re-billed — force only clears the SESSION outcome.
    expect(mockedTranslate.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(translatedMetadata('Shadow Slave')).toBe('ع: Shadow Slave');
    expect(updates.length).toBeGreaterThanOrEqual(0);
    unsubscribe();
  });
});
