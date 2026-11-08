// lnreader-ios/src/screens/settings/SettingsTranslationScreen/SettingsTranslationScreen.tsx
//
// «الترجمة» — the Moon novels translation settings (Zeus engine port).
// Sections: engine + target language, behavior switches, provider
// management (keys in Keychain via expo-secure-store), Cloudflare
// connection import, glossary (global + per-novel), translation memory
// stats with destructive actions behind confirmation dialogs.
//
// Uses ONLY the repo's own component contracts (List.Item takes
// title/description/icon/right/onPress — no titleStyle passthrough).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { TextInput } from 'react-native-paper';

import {
  Appbar,
  ConfirmationDialog,
  Dialog,
  List,
  SafeAreaView,
} from '@components';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import type { SettingsStackParamList } from '@navigators/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  AI_PROVIDER_KINDS,
  AIProviderConfiguration,
  AIProviderKind,
  TranslationEngine,
  TRANSLATION_ENGINES,
  engineTitle,
  isAccountKind,
  newProviderConfiguration,
  providerKindTitle,
  translationLanguages,
} from '@services/translation/types';
import {
  GlossaryItem,
  effectivePrefs,
  loadCloudflareConfig,
  loadGlossary,
  loadProviders,
  loadTranslationPrefs,
  saveCloudflareConfig,
  saveGlossary,
  saveNovelOverride,
  saveProviders,
  saveTranslationPrefs,
} from '@services/translation/prefs';
import { readSecret, saveSecret } from '@services/translation/secrets';
import { discoverCloudflare } from '@services/translation/providers/cloudflare';
import {
  providerDiscover,
  providerGenerate,
} from '@services/translation/providerService';
import { TranslationMemory } from '@services/translation/memory';

type ScreenProps = NativeStackScreenProps<
  SettingsStackParamList,
  'TranslationSettings'
>;

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 KB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 0.1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
};

const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const SettingsTranslationScreen = ({ navigation, route }: ScreenProps) => {
  const theme = useTheme();
  const novelId = route.params?.novelId;

  const [prefs, setPrefs] = useState(() => loadTranslationPrefs());
  const [providers, setProviders] = useState(() => loadProviders());
  const [cloudflareCfg, setCloudflareCfg] = useState(() =>
    loadCloudflareConfig(),
  );
  const [glossaryScope, setGlossaryScope] = useState<'global' | 'novel'>(
    'global',
  );
  const [glossary, setGlossary] = useState<GlossaryItem[]>(() =>
    loadGlossary(),
  );
  const [novelAuto, setNovelAuto] = useState<boolean>(() =>
    novelId ? !!effectivePrefs(novelId).automatic : false,
  );
  const [memoryStats, setMemoryStats] = useState({ entries: 0, bytes: 0 });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // dialogs
  const [engineDialog, setEngineDialog] = useState(false);
  const [languageDialog, setLanguageDialog] = useState(false);
  const [preloadDialog, setPreloadDialog] = useState(false);
  const [providerDialog, setProviderDialog] = useState(false);
  const [kindDialog, setKindDialog] = useState(false);
  const [glossaryDialog, setGlossaryDialog] = useState(false);
  const [clearAllDialog, setClearAllDialog] = useState(false);
  const [clearNovelDialog, setClearNovelDialog] = useState(false);
  const [googleKeyDialog, setGoogleKeyDialog] = useState(false);
  const [cloudflareDialog, setCloudflareDialog] = useState(false);

  // editor state
  const [editing, setEditing] = useState<AIProviderConfiguration | null>(null);
  const [editingKey, setEditingKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [cfToken, setCfToken] = useState('');
  const [cfEndpoint, setCfEndpoint] = useState('');
  const [glossaryTerm, setGlossaryTerm] = useState('');
  const [glossaryValue, setGlossaryValue] = useState('');

  const reloadGlossary = useCallback(
    (scope: 'global' | 'novel') => {
      setGlossary(loadGlossary(scope === 'novel' ? novelId : undefined));
    },
    [novelId],
  );

  useEffect(() => {
    TranslationMemory.stats()
      .then(setMemoryStats)
      .catch(() => {});
  }, []);

  const updatePrefs = useCallback((patch: Partial<typeof prefs>) => {
    setPrefs(current => {
      const next = { ...current, ...patch };
      saveTranslationPrefs(next);
      return next;
    });
  }, []);

  const selectedProvider = useMemo(
    () => providers.find(p => p.id === prefs.providerID) ?? null,
    [providers, prefs.providerID],
  );

  const engineNeedsProvider = prefs.engine === TranslationEngine.ai;
  const engineNeedsGoogleKey = prefs.engine === TranslationEngine.googleCloud;
  const engineNeedsCloudflare = prefs.engine === TranslationEngine.cloudflare;

  // ------------------------------------------------------------ actions --

  const saveProvider = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const next = providers.filter(p => p.id !== editing.id);
      next.push(editing);
      saveProviders(next);
      setProviders(next);
      if (editingKey) {
        await saveSecret(editing.id, editingKey);
        setEditingKey('');
      }
      if (!prefs.providerID && prefs.engine === TranslationEngine.ai) {
        updatePrefs({ providerID: editing.id });
      }
      setProviderDialog(false);
      setNotice('');
    } finally {
      setBusy(false);
    }
  };

  const testProvider = async () => {
    if (!editing) return;
    setBusy(true);
    setNotice('');
    try {
      const secret = editingKey || readSecret(editing.id);
      const discovered = await providerDiscover(
        editing,
        secret,
        new AbortController().signal,
      );
      setEditing(discovered);
      setNotice(getString('translation.testOk'));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const testGenerate = async () => {
    if (!editing) return;
    setBusy(true);
    setNotice('');
    try {
      const secret = editingKey || readSecret(editing.id);
      await providerGenerate(
        'Reply with the single word: OK',
        editing,
        secret,
        new AbortController().signal,
      );
      setNotice(getString('translation.testOk'));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const importCloudflare = async () => {
    setBusy(true);
    setNotice('');
    try {
      const config = { ...cloudflareCfg };
      if (cfEndpoint.trim()) config.endpoint = cfEndpoint.trim();
      await saveSecret('cloudflare-workers-ai', cfToken.trim());
      const discovered = await discoverCloudflare(
        config,
        cfToken.trim(),
        new AbortController().signal,
      );
      saveCloudflareConfig(discovered);
      setCloudflareCfg(discovered);
      setCloudflareDialog(false);
      setNotice(getString('translation.testOk'));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveGoogleKey = async () => {
    await saveSecret('google-cloud', googleKey.trim());
    setGoogleKeyDialog(false);
    setNotice(getString('translation.testOk'));
  };

  const addGlossaryItem = () => {
    const term = glossaryTerm.trim();
    const translation = glossaryValue.trim();
    if (!term || !translation) return;
    const next = [
      ...glossary.filter(g => g.term.toLowerCase() !== term.toLowerCase()),
      { id: uid(), term, translation },
    ];
    setGlossary(next);
    saveGlossary(next, glossaryScope === 'novel' ? novelId : undefined);
    setGlossaryTerm('');
    setGlossaryValue('');
    setGlossaryDialog(false);
  };

  const deleteGlossaryItem = (id: string) => {
    const next = glossary.filter(g => g.id !== id);
    setGlossary(next);
    saveGlossary(next, glossaryScope === 'novel' ? novelId : undefined);
  };

  const clearAllTranslations = async () => {
    await TranslationMemory.clearAll();
    setMemoryStats({ entries: 0, bytes: 0 });
    setNotice(getString('translation.memoryCleared'));
  };

  const clearNovelTranslations = async () => {
    if (novelId) {
      await TranslationMemory.clearNovel(novelId);
    }
    setNotice(getString('translation.memoryCleared'));
  };

  // ------------------------------------------------------------- render --

  return (
    <SafeAreaView excludeTop>
      <Appbar title="الترجمة" handleGoBack={navigation.goBack} theme={theme} />
      <ScrollView
        contentContainerStyle={styles.paddingBottom}
        style={{ backgroundColor: theme.background }}
      >
        {notice ? <List.Item title={notice} theme={theme} /> : null}

        {/* ------------------------------------------------ core engine -- */}
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('translation.engine')}
          </List.SubHeader>
          <List.Item
            title={engineTitle(prefs.engine)}
            description={getString('translation.engineNote')}
            onPress={() => setEngineDialog(true)}
            theme={theme}
          />
          <List.Item
            title={getString('translation.targetLanguage')}
            description={
              translationLanguages.find(l => l[0] === prefs.target)?.[1] ??
              prefs.target
            }
            onPress={() => setLanguageDialog(true)}
            theme={theme}
          />
          <List.Item
            title={getString('translation.preloadNext')}
            description={
              (prefs.preloadNext ?? 0) === 0
                ? 'إيقاف'
                : `الفصل${
                    (prefs.preloadNext ?? 0) === 1 ? ' القادم' : 'ان القادمان'
                  }`
            }
            onPress={() => setPreloadDialog(true)}
            theme={theme}
          />
          {novelId ? (
            <List.Item
              title="الترجمة التلقائية لهذه الرواية"
              description={
                novelAuto ? 'مفعّلة لهذه الرواية' : 'مغلقة لهذه الرواية'
              }
              onPress={() => {
                const next = !novelAuto;
                setNovelAuto(next);
                saveNovelOverride(novelId, { automatic: next });
                setNotice(
                  next
                    ? 'فُعّلت الترجمة التلقائية لهذه الرواية'
                    : 'أُوقفت الترجمة التلقائية لهذه الرواية',
                );
              }}
              theme={theme}
            />
          ) : null}
        </List.Section>

        {/* ---------------------------------------------------- behavior -- */}
        <List.Section>
          <List.SubHeader theme={theme}>السلوك</List.SubHeader>
          <List.Item
            title={getString('translation.automatic')}
            description={prefs.automatic ? 'مفعّل' : 'مغلق'}
            onPress={() => updatePrefs({ automatic: !prefs.automatic })}
            theme={theme}
          />
          <List.Item
            title={getString('translation.suggest')}
            description={prefs.suggest ? 'مفعّل' : 'مغلق'}
            onPress={() => updatePrefs({ suggest: !prefs.suggest })}
            theme={theme}
          />
          <List.Item
            title={getString('translation.retain')}
            description={prefs.retainTranslations === false ? 'مغلق' : 'مفعّل'}
            onPress={() =>
              updatePrefs({
                retainTranslations: prefs.retainTranslations === false,
              })
            }
            theme={theme}
          />
        </List.Section>

        {/* --------------------------------------------------- providers -- */}
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('translation.providers')}
          </List.SubHeader>
          {engineNeedsProvider ? (
            <List.Item
              title={
                selectedProvider?.name ||
                getString('translation.providerRequired')
              }
              description={
                selectedProvider
                  ? `${providerKindTitle(selectedProvider.kind)} — ${
                      selectedProvider.model
                    }`
                  : undefined
              }
              onPress={() => setKindDialog(true)}
              theme={theme}
            />
          ) : null}
          {engineNeedsGoogleKey ? (
            <List.Item
              title="مفتاح Google Cloud"
              description={getString('translation.keychainNote')}
              onPress={() => setGoogleKeyDialog(true)}
              theme={theme}
            />
          ) : null}
          {engineNeedsCloudflare ? (
            <List.Item
              title={cloudflareCfg.accountName || 'Cloudflare Workers AI'}
              description={`${cloudflareCfg.model} — ${getString(
                'translation.cloudflareImport',
              )}`}
              onPress={() => {
                setCfEndpoint(cloudflareCfg.endpoint);
                setCloudflareDialog(true);
              }}
              theme={theme}
            />
          ) : null}
          <List.Item
            title="إضافة / تحرير مزوّد AI"
            description={getString('translation.keychainNote')}
            onPress={() => {
              setEditing(newProviderConfiguration());
              setEditingKey('');
              setProviderDialog(true);
            }}
            theme={theme}
          />
          {providers.map(p => (
            <List.Item
              key={p.id}
              title={`${p.id === prefs.providerID ? '✓ ' : ''}${
                p.name || providerKindTitle(p.kind)
              }`}
              description={`${providerKindTitle(p.kind)} — ${p.model || '—'}`}
              onPress={() => {
                setEditing(p);
                setEditingKey('');
                setProviderDialog(true);
              }}
              theme={theme}
            />
          ))}
        </List.Section>

        {/* ---------------------------------------------------- glossary -- */}
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('translation.glossary')}
          </List.SubHeader>
          <List.Item
            title={
              glossaryScope === 'global'
                ? getString('translation.glossaryScopeGlobal')
                : getString('translation.glossaryScopeNovel')
            }
            icon="swap-horizontal"
            onPress={() => {
              const next = glossaryScope === 'global' ? 'novel' : 'global';
              setGlossaryScope(next);
              reloadGlossary(next);
            }}
            theme={theme}
          />
          <List.Item
            title={getString('translation.glossaryAdd')}
            icon="plus"
            onPress={() => setGlossaryDialog(true)}
            theme={theme}
          />
          {glossary.map(item => (
            <List.Item
              key={item.id}
              title={item.term}
              description={item.translation}
              right="close"
              onPress={() => deleteGlossaryItem(item.id)}
              theme={theme}
            />
          ))}
        </List.Section>

        {/* ------------------------------------------------------ memory -- */}
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('translation.memory')}
          </List.SubHeader>
          <List.Item
            title={getString('translation.memoryEntries')}
            description={String(memoryStats.entries)}
            theme={theme}
          />
          <List.Item
            title={getString('translation.memorySize')}
            description={formatBytes(memoryStats.bytes)}
            theme={theme}
          />
          <List.Item
            title={getString('translation.memoryClearNovel')}
            icon="delete-outline"
            onPress={() => setClearNovelDialog(true)}
            theme={theme}
          />
          <List.Item
            title={getString('translation.memoryClearAll')}
            description="الفصول الأصلية والمكتبة لا تُمس"
            icon="delete-forever-outline"
            onPress={() => setClearAllDialog(true)}
            theme={theme}
          />
        </List.Section>
        {busy ? <List.Item title="… جارٍ التنفيذ" theme={theme} /> : null}
      </ScrollView>

      {/* ------------------------------------------------------ dialogs -- */}
      <Dialog.Root
        visible={engineDialog}
        onDismiss={() => setEngineDialog(false)}
      >
        <Dialog.Title>{getString('translation.engine')}</Dialog.Title>
        <Dialog.Content>
          {TRANSLATION_ENGINES.map(engine => (
            <List.Item
              key={engine}
              title={`${engine === prefs.engine ? '✓ ' : ''}${engineTitle(
                engine,
              )}`}
              onPress={() => {
                updatePrefs({ engine });
                setEngineDialog(false);
              }}
              theme={theme}
            />
          ))}
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setEngineDialog(false)}>
            {getString('common.cancel')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>

      <Dialog.Root
        visible={languageDialog}
        onDismiss={() => setLanguageDialog(false)}
      >
        <Dialog.Title>{getString('translation.targetLanguage')}</Dialog.Title>
        <Dialog.Content>
          <ScrollView style={styles.dialogScroll}>
            {translationLanguages.map(([code, name]) => (
              <List.Item
                key={code}
                title={`${code === prefs.target ? '✓ ' : ''}${name}`}
                onPress={() => {
                  updatePrefs({ target: code });
                  setLanguageDialog(false);
                }}
                theme={theme}
              />
            ))}
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setLanguageDialog(false)}>
            {getString('common.cancel')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>

      <Dialog.Root
        visible={preloadDialog}
        onDismiss={() => setPreloadDialog(false)}
      >
        <Dialog.Title>{getString('translation.preloadNext')}</Dialog.Title>
        <Dialog.Content>
          {[0, 1, 2].map(n => (
            <List.Item
              key={n}
              title={`${(prefs.preloadNext ?? 0) === n ? '✓ ' : ''}${
                n === 0
                  ? 'إيقاف'
                  : n === 1
                  ? 'الفصل القادم'
                  : 'الفصلان القادمان'
              }`}
              onPress={() => {
                updatePrefs({ preloadNext: n });
                setPreloadDialog(false);
              }}
              theme={theme}
            />
          ))}
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root visible={kindDialog} onDismiss={() => setKindDialog(false)}>
        <Dialog.Title>{getString('translation.providerKind')}</Dialog.Title>
        <Dialog.Content>
          {AI_PROVIDER_KINDS.map(kind => (
            <List.Item
              key={kind}
              title={providerKindTitle(kind)}
              description={
                isAccountKind(kind)
                  ? 'تجريبي — بروتوكول خاص قد يتغير'
                  : undefined
              }
              onPress={() => {
                setKindDialog(false);
                setEditing(newProviderConfiguration(kind));
                setEditingKey('');
                setProviderDialog(true);
              }}
              theme={theme}
            />
          ))}
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root
        visible={providerDialog}
        onDismiss={() => setProviderDialog(false)}
      >
        <Dialog.Title>{getString('translation.providerName')}</Dialog.Title>
        <Dialog.Content>
          <ScrollView style={styles.dialogScroll}>
            {editing && !isAccountKind(editing.kind) ? (
              <TextInput
                value={editing.baseURL}
                placeholder={getString('translation.baseURL')}
                onChangeText={text =>
                  setEditing(cur => (cur ? { ...cur, baseURL: text } : cur))
                }
                mode="outlined"
                theme={{ colors: { ...theme } }}
              />
            ) : null}
            {editing && editing.kind === AIProviderKind.geminiAccount ? (
              <TextInput
                value={String(editing.googleAccountIndex ?? 0)}
                placeholder="فهرس حساب Google"
                onChangeText={text =>
                  setEditing(cur =>
                    cur
                      ? { ...cur, googleAccountIndex: Number(text) || 0 }
                      : cur,
                  )
                }
                mode="outlined"
                theme={{ colors: { ...theme } }}
                style={styles.inputGap}
              />
            ) : null}
            {editing && isAccountKind(editing.kind) ? (
              <TextInput
                value={editingKey}
                placeholder={
                  editing.kind === AIProviderKind.chatGPTAccount
                    ? 'Access Token (JWT)'
                    : 'ترويسة Cookie لحساب Google'
                }
                onChangeText={setEditingKey}
                secureTextEntry
                mode="outlined"
                theme={{ colors: { ...theme } }}
              />
            ) : (
              <TextInput
                value={editingKey}
                placeholder={getString('translation.apiKey')}
                onChangeText={setEditingKey}
                secureTextEntry
                mode="outlined"
                theme={{ colors: { ...theme } }}
                style={styles.inputGap}
              />
            )}
            <TextInput
              value={editing?.model ?? ''}
              placeholder={getString('translation.model')}
              onChangeText={text =>
                setEditing(cur => (cur ? { ...cur, model: text } : cur))
              }
              mode="outlined"
              theme={{ colors: { ...theme } }}
              style={styles.inputGap}
            />
            <TextInput
              value={editing?.instruction ?? ''}
              placeholder={getString('translation.instruction')}
              onChangeText={text =>
                setEditing(cur => (cur ? { ...cur, instruction: text } : cur))
              }
              mode="outlined"
              multiline
              theme={{ colors: { ...theme } }}
              style={styles.inputGap}
            />
            {editing?.models.length ? (
              <View style={styles.modelList}>
                {editing.models.slice(0, 40).map(m => (
                  <List.Item
                    key={m.id}
                    title={`${m.id === editing.model ? '✓ ' : ''}${m.name}`}
                    onPress={() =>
                      setEditing(cur => (cur ? { ...cur, model: m.id } : cur))
                    }
                    theme={theme}
                  />
                ))}
              </View>
            ) : null}
            <TextInput
              value={editing?.name ?? ''}
              placeholder={getString('translation.providerName')}
              onChangeText={text =>
                setEditing(cur => (cur ? { ...cur, name: text } : cur))
              }
              mode="outlined"
              theme={{ colors: { ...theme } }}
              style={styles.inputGap}
            />
            {notice ? <List.Item title={notice} theme={theme} /> : null}
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setProviderDialog(false)}>
            {getString('common.cancel')}
          </Dialog.Action>
          <Dialog.Action onPress={() => void testProvider()}>
            {getString('translation.discoverModels')}
          </Dialog.Action>
          <Dialog.Action onPress={() => void testGenerate()}>
            {getString('translation.testConnection')}
          </Dialog.Action>
          <Dialog.Action onPress={() => void saveProvider()}>
            {getString('common.ok')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>

      <Dialog.Root
        visible={googleKeyDialog}
        onDismiss={() => setGoogleKeyDialog(false)}
      >
        <Dialog.Title>مفتاح Google Cloud Translation</Dialog.Title>
        <Dialog.Content>
          <TextInput
            value={googleKey}
            onChangeText={setGoogleKey}
            secureTextEntry
            mode="outlined"
            theme={{ colors: { ...theme } }}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setGoogleKeyDialog(false)}>
            {getString('common.cancel')}
          </Dialog.Action>
          <Dialog.Action onPress={() => void saveGoogleKey()}>
            {getString('common.ok')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>

      <Dialog.Root
        visible={cloudflareDialog}
        onDismiss={() => setCloudflareDialog(false)}
      >
        <Dialog.Title>{getString('translation.cloudflareImport')}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            value={cfEndpoint}
            placeholder="Worker endpoint (https://…)"
            onChangeText={setCfEndpoint}
            mode="outlined"
            theme={{ colors: { ...theme } }}
          />
          <TextInput
            value={cfToken}
            placeholder="رمز الربط (43 حرفًا)"
            onChangeText={setCfToken}
            secureTextEntry
            mode="outlined"
            theme={{ colors: { ...theme } }}
            style={styles.inputGap}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setCloudflareDialog(false)}>
            {getString('common.cancel')}
          </Dialog.Action>
          <Dialog.Action onPress={() => void importCloudflare()}>
            {getString('translation.testConnection')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>

      <Dialog.Root
        visible={glossaryDialog}
        onDismiss={() => setGlossaryDialog(false)}
      >
        <Dialog.Title>{getString('translation.glossaryAdd')}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            value={glossaryTerm}
            placeholder={getString('translation.glossaryTerm')}
            onChangeText={setGlossaryTerm}
            mode="outlined"
            theme={{ colors: { ...theme } }}
          />
          <TextInput
            value={glossaryValue}
            placeholder={getString('translation.glossaryTranslation')}
            onChangeText={setGlossaryValue}
            mode="outlined"
            theme={{ colors: { ...theme } }}
            style={styles.inputGap}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setGlossaryDialog(false)}>
            {getString('common.cancel')}
          </Dialog.Action>
          <Dialog.Action onPress={addGlossaryItem}>
            {getString('common.ok')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>

      <ConfirmationDialog
        visible={clearAllDialog}
        title={getString('translation.memoryClearAll')}
        message="سيُحذف كل ما حفظه محرك الترجمة. الفصول الأصلية والمكتبة وموضع القراءة تبقى كما هي."
        confirmLabel={getString('translation.memoryClearAll')}
        onDismiss={() => setClearAllDialog(false)}
        onConfirm={() => clearAllTranslations()}
      />
      <ConfirmationDialog
        visible={clearNovelDialog}
        title={getString('translation.memoryClearNovel')}
        message="ستُحذف سجلات ترجمة هذه الرواية. الفصول الأصلية تبقى كما هي."
        confirmLabel={getString('translation.memoryClearNovel')}
        onDismiss={() => setClearNovelDialog(false)}
        onConfirm={() => clearNovelTranslations()}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  paddingBottom: { paddingBottom: 48 },
  dialogScroll: { maxHeight: 420 },
  inputGap: { marginTop: 10 },
  modelList: { maxHeight: 220, marginTop: 8 },
});

export default SettingsTranslationScreen;
