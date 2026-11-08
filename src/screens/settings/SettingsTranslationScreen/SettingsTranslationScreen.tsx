import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Appbar, Dialog, List, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { MoreStackParamList } from '@navigators/types';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, IconButton } from 'react-native-paper';
import {
  AI_PROVIDER_KINDS,
  CLOUDFLARE_DEFAULT_ENDPOINT,
  CLOUDFLARE_DEFAULT_MODEL,
  TEST_CONNECTION_PROMPT,
  TRANSLATION_ENGINES,
  TRANSLATION_LANGUAGES,
  TranslationMemory,
  createProvider,
  createSqliteMemoryDriver,
  deleteSecret,
  discoverCloudflareModels,
  discoverProvider,
  generateWithProvider,
  keepsTranslations,
  loadPreferences,
  loadProviders,
  parseCloudflareConnection,
  readSecret,
  savePreferences,
  saveProviders,
  saveSecret,
  translateCloudflare,
  validateCloudflareToken,
  type AIProviderConfiguration,
  type CloudflareTranslationConfiguration,
  type TranslationMemoryStats,
  type TranslationPreferences,
} from '@services/translation';
import type { ThemeColors } from '@theme/types';

import SettingSwitch from '../components/SettingSwitch';

type TranslationSettingsProps = NativeStackScreenProps<
  MoreStackParamList,
  'TranslationSettings'
>;

const GLOSSARY_LIMIT = 200;
const PREFETCH_MINIMUM = 0;
const PREFETCH_MAXIMUM = 2;
const GOOGLE_CLOUD_SECRET_KEY = 'google-cloud';
const CLOUDFLARE_SECRET_KEY = 'cloudflare-workers-ai';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const providerKindTitle = (provider: AIProviderConfiguration): string =>
  AI_PROVIDER_KINDS.find(kind => kind.id === provider.kind)?.title ??
  provider.kind;

interface ProviderEditorDialogProps {
  provider: AIProviderConfiguration;
  secret: string;
  hasSecret: boolean;
  busy: boolean;
  theme: ThemeColors;
  onChange: (patch: Partial<AIProviderConfiguration>) => void;
  onSecretChange: (value: string) => void;
  onDiscover: () => void;
  onTest: () => void;
  onSelect: () => void;
  onDelete: () => void;
  onSave: () => void;
  onClose: () => void;
}

const ProviderEditorDialog = ({
  provider,
  secret,
  hasSecret,
  busy,
  theme,
  onChange,
  onSecretChange,
  onDiscover,
  onTest,
  onSelect,
  onDelete,
  onSave,
  onClose,
}: ProviderEditorDialogProps) => (
  <Dialog.Root visible onDismiss={onClose}>
    <Dialog.Header>
      <Dialog.Title>
        {provider.name.length > 0
          ? provider.name
          : getString('translationScreen.addProvider')}
      </Dialog.Title>
    </Dialog.Header>
    <Dialog.Content>
      <ScrollView style={styles.editorScroll} nestedScrollEnabled>
        <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
          {getString('translationScreen.providerName')}
        </Text>
        <TextInput
          value={provider.name}
          onChangeText={value => onChange({ name: value })}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.input,
            { color: theme.onSurface, borderColor: theme.outline },
          ]}
        />
        <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
          {getString('translationScreen.providerKind')}
        </Text>
        {AI_PROVIDER_KINDS.map(kind => (
          <List.Item
            key={kind.id}
            title={kind.title}
            right={provider.kind === kind.id ? 'check' : undefined}
            onPress={() => onChange({ kind: kind.id })}
            theme={theme}
          />
        ))}
        {provider.kind === 'openAICompatible' && (
          <>
            <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
              {getString('translationScreen.providerBaseURL')}
            </Text>
            <TextInput
              value={provider.baseURL}
              onChangeText={value => onChange({ baseURL: value })}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[
                styles.input,
                { color: theme.onSurface, borderColor: theme.outline },
              ]}
            />
          </>
        )}
        <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
          {getString('translationScreen.providerSecret')}
        </Text>
        <TextInput
          value={secret}
          onChangeText={onSecretChange}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.input,
            { color: theme.onSurface, borderColor: theme.outline },
          ]}
        />
        {hasSecret && (
          <Text style={[styles.badge, { color: theme.onSurfaceVariant }]}>
            {getString('translationScreen.savedBadge')}
          </Text>
        )}
        <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
          {getString('translationScreen.providerInstruction')}
        </Text>
        <TextInput
          value={provider.instruction}
          onChangeText={value => onChange({ instruction: value })}
          multiline
          textAlignVertical="top"
          style={[
            styles.input,
            styles.multiline,
            { color: theme.onSurface, borderColor: theme.outline },
          ]}
        />
        <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
          {getString('translationScreen.models')}
        </Text>
        {provider.models.length === 0 && (
          <Text style={[styles.caption, { color: theme.onSurfaceVariant }]}>
            {getString('translationScreen.noModels')}
          </Text>
        )}
        {provider.models.length > 0 && (
          <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
            {provider.models.map(model => (
              <List.Item
                key={model.id}
                title={model.name}
                description={model.id}
                right={provider.model === model.id ? 'check' : undefined}
                onPress={() => onChange({ model: model.id })}
                theme={theme}
              />
            ))}
          </ScrollView>
        )}
        <View style={styles.row}>
          <Button
            mode="outlined"
            onPress={onDiscover}
            disabled={busy}
            style={styles.actionButton}
          >
            {getString('translationScreen.discoverModels')}
          </Button>
          <Button
            mode="outlined"
            onPress={onTest}
            disabled={busy}
            style={styles.actionButton}
          >
            {getString('translationScreen.testConnection')}
          </Button>
          {busy && <ActivityIndicator />}
        </View>
        <List.Item
          title={getString('translationScreen.deleteProvider')}
          icon="delete-outline"
          onPress={onDelete}
          theme={theme}
        />
      </ScrollView>
    </Dialog.Content>
    <Dialog.Actions>
      <Dialog.Action
        title={getString('translationScreen.cancelAction')}
        onPress={onClose}
      />
      <Dialog.Action
        title={getString('translationScreen.providerSelect')}
        onPress={onSelect}
      />
      <Dialog.Action
        title={getString('translationScreen.saveAction')}
        onPress={() => onSave()}
      />
    </Dialog.Actions>
  </Dialog.Root>
);

const SettingsTranslation = ({ navigation }: TranslationSettingsProps) => {
  const theme = useTheme();

  const [prefs, setPrefs] = useState<TranslationPreferences>(() =>
    loadPreferences(),
  );
  const [providers, setProviders] = useState<AIProviderConfiguration[]>(() =>
    loadProviders(),
  );
  const [busy, setBusy] = useState(false);

  const [languageDialogVisible, setLanguageDialogVisible] = useState(false);
  const [engineDialogVisible, setEngineDialogVisible] = useState(false);

  const [googleCloudKey, setGoogleCloudKey] = useState('');
  const [googleCloudSaved, setGoogleCloudSaved] = useState(false);

  const [editorProvider, setEditorProvider] =
    useState<AIProviderConfiguration | null>(null);
  const [editorSecret, setEditorSecret] = useState('');
  const [editorHasSecret, setEditorHasSecret] = useState(false);

  const [cloudflareToken, setCloudflareToken] = useState('');
  const [cloudflareHasToken, setCloudflareHasToken] = useState(false);
  const [importDialogVisible, setImportDialogVisible] = useState(false);
  const [importJson, setImportJson] = useState('');

  const [glossaryTerm, setGlossaryTerm] = useState('');
  const [glossaryReplacement, setGlossaryReplacement] = useState('');
  const [excludedHost, setExcludedHost] = useState('');
  const [customInstruction, setCustomInstruction] = useState(
    () => prefs.customInstruction,
  );

  const [memoryStats, setMemoryStats] = useState<TranslationMemoryStats | null>(
    null,
  );
  const memoryRef = useRef<TranslationMemory | null>(null);

  const update = useCallback((patch: Partial<TranslationPreferences>) => {
    setPrefs(previous => {
      const next = { ...previous, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const refreshMemoryStats = useCallback(async () => {
    const memory = memoryRef.current;
    if (!memory) return;
    try {
      await memory.initialize();
      setMemoryStats(await memory.stats());
    } catch {
      setMemoryStats({ entries: 0, bytes: 0 });
    }
  }, []);

  useEffect(() => {
    const memory = new TranslationMemory(createSqliteMemoryDriver());
    memoryRef.current = memory;
    void refreshMemoryStats();
  }, [refreshMemoryStats]);

  useEffect(() => {
    let cancelled = false;
    void readSecret(GOOGLE_CLOUD_SECRET_KEY)
      .then(value => {
        if (!cancelled) setGoogleCloudSaved(value.length > 0);
      })
      .catch(() => {
        if (!cancelled) setGoogleCloudSaved(false);
      });
    void readSecret(CLOUDFLARE_SECRET_KEY)
      .then(value => {
        if (!cancelled) setCloudflareHasToken(value.length > 0);
      })
      .catch(() => {
        if (!cancelled) setCloudflareHasToken(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cloudflareConfig = useMemo<CloudflareTranslationConfiguration>(
    () =>
      prefs.cloudflare ?? {
        endpoint: CLOUDFLARE_DEFAULT_ENDPOINT,
        accountID: '',
        accountName: '',
        model: CLOUDFLARE_DEFAULT_MODEL,
        models: [],
        instruction: '',
        lastChecked: null,
      },
    [prefs.cloudflare],
  );

  const updateCloudflare = useCallback(
    (patch: Partial<CloudflareTranslationConfiguration>) => {
      update({ cloudflare: { ...cloudflareConfig, ...patch } });
    },
    [cloudflareConfig, update],
  );

  const showError = useCallback((error: unknown) => {
    Alert.alert(
      getString('translationScreen.errorTitle'),
      getErrorMessage(error),
    );
  }, []);

  const confirmRemoval = useCallback(
    (message: string, onConfirm: () => void) => {
      Alert.alert(getString('translationScreen.confirmTitle'), message, [
        { text: getString('translationScreen.cancelAction'), style: 'cancel' },
        {
          text: getString('translationScreen.confirmAction'),
          style: 'destructive',
          onPress: onConfirm,
        },
      ]);
    },
    [],
  );

  const saveGoogleCloudKey = async () => {
    const key = googleCloudKey.trim();
    if (key.length === 0) return;
    setBusy(true);
    try {
      await saveSecret(GOOGLE_CLOUD_SECRET_KEY, key);
      setGoogleCloudKey('');
      setGoogleCloudSaved(true);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const openEditor = useCallback((provider: AIProviderConfiguration) => {
    setEditorProvider(provider);
    setEditorSecret('');
    void readSecret(provider.id)
      .then(value => setEditorHasSecret(value.length > 0))
      .catch(() => setEditorHasSecret(false));
  }, []);

  const saveEditor = async () => {
    if (!editorProvider) return;
    const draft = editorProvider;
    const exists = providers.some(row => row.id === draft.id);
    const nextProviders = exists
      ? providers.map(row => (row.id === draft.id ? draft : row))
      : [...providers, draft];
    setProviders(nextProviders);
    saveProviders(nextProviders);
    const savedSecret = editorSecret.trim();
    if (savedSecret.length > 0) await saveSecret(draft.id, savedSecret);
    update({ providerID: draft.id });
    setEditorProvider(null);
  };

  const selectEditorProvider = () => {
    if (!editorProvider) return;
    update({ providerID: editorProvider.id });
    setEditorProvider(null);
  };

  const discoverEditorModels = async () => {
    if (!editorProvider) return;
    setBusy(true);
    try {
      const stored = await readSecret(editorProvider.id);
      const secret = editorSecret.trim() || stored.trim();
      const updated = await discoverProvider(editorProvider, secret);
      setEditorProvider(updated);
      setEditorHasSecret(secret.length > 0);
      const nextProviders = providers.some(row => row.id === updated.id)
        ? providers.map(row => (row.id === updated.id ? updated : row))
        : [...providers, updated];
      setProviders(nextProviders);
      saveProviders(nextProviders);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const testEditorConnection = async () => {
    if (!editorProvider) return;
    setBusy(true);
    try {
      const stored = await readSecret(editorProvider.id);
      const secret = editorSecret.trim() || stored.trim();
      const response = await generateWithProvider(
        TEST_CONNECTION_PROMPT,
        editorProvider,
        secret,
      );
      const trimmed = response.trim();
      Alert.alert(
        getString('translationScreen.testConnection'),
        trimmed === 'OK'
          ? getString('translationScreen.testOk')
          : `${getString('translationScreen.testUnexpected')}: ${trimmed}`,
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const deleteEditorProvider = () => {
    if (!editorProvider) return;
    const target = editorProvider;
    confirmRemoval(
      getString('translationScreen.deleteProviderMessage'),
      () => {
        const nextProviders = providers.filter(row => row.id !== target.id);
        setProviders(nextProviders);
        saveProviders(nextProviders);
        void deleteSecret(target.id).catch(() => undefined);
        if (prefs.providerID === target.id) {
          update({ providerID: null });
        }
        setEditorProvider(null);
      },
    );
  };

  const saveCloudflareToken = async () => {
    const token = cloudflareToken.trim();
    if (token.length === 0) return;
    setBusy(true);
    try {
      validateCloudflareToken(token);
      await saveSecret(CLOUDFLARE_SECRET_KEY, token);
      setCloudflareToken('');
      setCloudflareHasToken(true);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const discoverCloudflare = async () => {
    setBusy(true);
    try {
      const stored = await readSecret(CLOUDFLARE_SECRET_KEY);
      const secret = cloudflareToken.trim() || stored.trim();
      const found = await discoverCloudflareModels(
        cloudflareConfig.endpoint,
        secret,
      );
      updateCloudflare({
        models: found.models,
        accountID: found.accountID,
        accountName: found.accountName,
        model:
          found.defaultModel.length > 0
            ? found.defaultModel
            : cloudflareConfig.model,
      });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const testCloudflare = async () => {
    setBusy(true);
    try {
      const stored = await readSecret(CLOUDFLARE_SECRET_KEY);
      const secret = cloudflareToken.trim() || stored.trim();
      const results = await translateCloudflare(
        [
          { id: 't1', text: 'Hello' },
          { id: 't2', text: 'World' },
        ],
        prefs.target,
        cloudflareConfig,
        secret,
      );
      Alert.alert(
        getString('translationScreen.testConnection'),
        results.map(row => row.text).join(' · '),
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const importCloudflareConnection = () => {
    try {
      const file = parseCloudflareConnection(importJson.trim());
      updateCloudflare({
        endpoint: file.endpoint,
        accountID: file.accountID,
        accountName: file.accountName,
        model: file.model,
      });
      void saveSecret(CLOUDFLARE_SECRET_KEY, file.token)
        .then(() => setCloudflareHasToken(true))
        .catch(showError);
      setImportJson('');
      setImportDialogVisible(false);
      Alert.alert(
        getString('translationScreen.cloudflareImportTitle'),
        getString('translationScreen.cloudflareImported'),
      );
    } catch (error) {
      showError(error);
    }
  };

  const addGlossaryEntry = () => {
    const term = glossaryTerm.trim();
    const replacement = glossaryReplacement.trim();
    if (term.length === 0 || replacement.length === 0) return;
    if (prefs.glossary.length >= GLOSSARY_LIMIT) return;
    update({ glossary: [...prefs.glossary, { term, replacement }] });
    setGlossaryTerm('');
    setGlossaryReplacement('');
  };

  const addExcludedHost = () => {
    const host = excludedHost.trim().toLowerCase();
    if (host.length === 0 || prefs.excludedHosts.includes(host)) return;
    update({ excludedHosts: [...prefs.excludedHosts, host] });
    setExcludedHost('');
  };

  const targetLanguageName =
    TRANSLATION_LANGUAGES.find(([code]) => code === prefs.target)?.[1] ??
    prefs.target;
  const engineTitle =
    TRANSLATION_ENGINES.find(engine => engine.id === prefs.engine)?.title ??
    prefs.engine;

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('translationScreen.title')}
        handleGoBack={navigation.goBack}
        theme={theme}
      />
      <ScrollView contentContainerStyle={styles.paddingBottom}>
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('translationScreen.generalHeader')}
          </List.SubHeader>
          <List.Item
            title={getString('translationScreen.targetLanguage')}
            description={targetLanguageName}
            right="chevron-right"
            onPress={() => setLanguageDialogVisible(true)}
            theme={theme}
          />
          <List.Item
            title={getString('translationScreen.engine')}
            description={engineTitle}
            right="chevron-right"
            onPress={() => setEngineDialogVisible(true)}
            theme={theme}
          />

          {prefs.engine === 'googleWeb' && (
            <Text style={[styles.caption, { color: theme.onSurfaceVariant }]}>
              {getString('translationScreen.googleWebCaption')}
            </Text>
          )}

          {prefs.engine === 'googleCloud' && (
            <View>
              <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
                {getString('translationScreen.googleCloudKey')}
              </Text>
              <TextInput
                value={googleCloudKey}
                onChangeText={setGoogleCloudKey}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  { color: theme.onSurface, borderColor: theme.outline },
                ]}
              />
              <View style={styles.row}>
                <Button
                  onPress={() => void saveGoogleCloudKey()}
                  disabled={busy || googleCloudKey.trim().length === 0}
                >
                  {getString('translationScreen.saveAction')}
                </Button>
                {googleCloudSaved && (
                  <Text
                    style={[styles.badge, { color: theme.onSurfaceVariant }]}
                  >
                    {getString('translationScreen.savedBadge')}
                  </Text>
                )}
              </View>
              <Text
                style={[styles.caption, { color: theme.onSurfaceVariant }]}
              >
                {getString('translationScreen.googleCloudCaption')}
              </Text>
            </View>
          )}

          {prefs.engine === 'ai' && (
            <View>
              {providers.length === 0 ? (
                <Text
                  style={[styles.caption, { color: theme.onSurfaceVariant }]}
                >
                  {getString('translationScreen.noProviderSelected')}
                </Text>
              ) : (
                <Text
                  style={[styles.caption, { color: theme.onSurfaceVariant }]}
                >
                  {getString('translationScreen.providerSelectHint')}
                </Text>
              )}
              {providers.map(provider => (
                <List.Item
                  key={provider.id}
                  title={
                    provider.name.length > 0
                      ? provider.name
                      : getString('translationScreen.providerUntitled')
                  }
                  description={[providerKindTitle(provider), provider.model]
                    .filter(part => part.length > 0)
                    .join(' · ')}
                  icon={
                    prefs.providerID === provider.id
                      ? 'check-circle'
                      : 'circle-outline'
                  }
                  right="pencil"
                  onPress={() => openEditor(provider)}
                  theme={theme}
                />
              ))}
              <List.Item
                title={getString('translationScreen.addProvider')}
                icon="plus"
                onPress={() => openEditor(createProvider())}
                theme={theme}
              />
            </View>
          )}

          {prefs.engine === 'cloudflare' && (
            <View>
              <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
                {getString('translationScreen.cloudflareEndpoint')}
              </Text>
              <TextInput
                value={cloudflareConfig.endpoint}
                onChangeText={value => updateCloudflare({ endpoint: value })}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[
                  styles.input,
                  { color: theme.onSurface, borderColor: theme.outline },
                ]}
              />
              <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
                {getString('translationScreen.cloudflareToken')}
              </Text>
              <TextInput
                value={cloudflareToken}
                onChangeText={setCloudflareToken}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  { color: theme.onSurface, borderColor: theme.outline },
                ]}
              />
              <View style={styles.row}>
                <Button
                  onPress={() => void saveCloudflareToken()}
                  disabled={busy || cloudflareToken.trim().length === 0}
                >
                  {getString('translationScreen.saveAction')}
                </Button>
                {cloudflareHasToken && (
                  <Text
                    style={[styles.badge, { color: theme.onSurfaceVariant }]}
                  >
                    {getString('translationScreen.savedBadge')}
                  </Text>
                )}
              </View>
              <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
                {getString('translationScreen.cloudflareModel')}
              </Text>
              <TextInput
                value={cloudflareConfig.model}
                onChangeText={value => updateCloudflare({ model: value })}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  { color: theme.onSurface, borderColor: theme.outline },
                ]}
              />
              <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
                {getString('translationScreen.cloudflareInstruction')}
              </Text>
              <TextInput
                value={cloudflareConfig.instruction}
                onChangeText={value =>
                  updateCloudflare({ instruction: value })
                }
                multiline
                textAlignVertical="top"
                style={[
                  styles.input,
                  styles.multiline,
                  { color: theme.onSurface, borderColor: theme.outline },
                ]}
              />
              <View style={styles.row}>
                <Button
                  mode="outlined"
                  onPress={() => void discoverCloudflare()}
                  disabled={busy}
                  style={styles.actionButton}
                >
                  {getString('translationScreen.discoverModels')}
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => void testCloudflare()}
                  disabled={busy}
                  style={styles.actionButton}
                >
                  {getString('translationScreen.testConnection')}
                </Button>
                {busy && <ActivityIndicator />}
              </View>
              {cloudflareConfig.models.length > 0 && (
                <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
                  {cloudflareConfig.models.map(model => (
                    <List.Item
                      key={model.id}
                      title={model.name}
                      description={model.id}
                      right={
                        cloudflareConfig.model === model.id
                          ? 'check'
                          : undefined
                      }
                      onPress={() => updateCloudflare({ model: model.id })}
                      theme={theme}
                    />
                  ))}
                </ScrollView>
              )}
              <List.Item
                title={getString('translationScreen.cloudflareImport')}
                icon="download"
                onPress={() => setImportDialogVisible(true)}
                theme={theme}
              />
            </View>
          )}

          {prefs.engine === 'microsoftVisco' && (
            <Text style={[styles.caption, { color: theme.onSurfaceVariant }]}>
              {getString('translationScreen.viscoCaption')}
            </Text>
          )}

          <List.SubHeader theme={theme}>
            {getString('translationScreen.behaviorHeader')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('translationScreen.suggest')}
            description={getString('translationScreen.suggestDesc')}
            value={prefs.suggest}
            onPress={() => update({ suggest: !prefs.suggest })}
            theme={theme}
          />
          <SettingSwitch
            label={getString('translationScreen.automatic')}
            description={getString('translationScreen.automaticDesc')}
            value={prefs.automatic}
            onPress={() => update({ automatic: !prefs.automatic })}
            theme={theme}
          />
          <SettingSwitch
            label={getString('translationScreen.dynamicContent')}
            description={getString('translationScreen.dynamicContentDesc')}
            value={prefs.dynamicContent}
            onPress={() => update({ dynamicContent: !prefs.dynamicContent })}
            theme={theme}
          />
          <SettingSwitch
            label={getString('translationScreen.keepsTranslations')}
            description={getString('translationScreen.keepsTranslationsDesc')}
            value={keepsTranslations(prefs)}
            onPress={() =>
              update({ retainTranslations: !keepsTranslations(prefs) })
            }
            theme={theme}
          />
          <SettingSwitch
            label={getString('translationScreen.readerAutomatic')}
            description={getString('translationScreen.readerAutomaticDesc')}
            value={prefs.readerAutomatic}
            onPress={() =>
              update({ readerAutomatic: !prefs.readerAutomatic })
            }
            theme={theme}
          />
          <View style={styles.stepperRow}>
            <View style={styles.stepperText}>
              <Text style={[styles.itemTitle, { color: theme.onSurface }]}>
                {getString('translationScreen.prefetch')}
              </Text>
              <Text
                style={[styles.itemDesc, { color: theme.onSurfaceVariant }]}
              >
                {getString('translationScreen.prefetchDesc')}
              </Text>
            </View>
            <IconButton
              icon="minus"
              onPress={() =>
                update({
                  prefetchNextChapters: Math.max(
                    PREFETCH_MINIMUM,
                    prefs.prefetchNextChapters - 1,
                  ),
                })
              }
              disabled={prefs.prefetchNextChapters <= PREFETCH_MINIMUM}
            />
            <Text style={[styles.stepperValue, { color: theme.onSurface }]}>
              {prefs.prefetchNextChapters}
            </Text>
            <IconButton
              icon="plus"
              onPress={() =>
                update({
                  prefetchNextChapters: Math.min(
                    PREFETCH_MAXIMUM,
                    prefs.prefetchNextChapters + 1,
                  ),
                })
              }
              disabled={prefs.prefetchNextChapters >= PREFETCH_MAXIMUM}
            />
          </View>

          <List.SubHeader theme={theme}>
            {getString('translationScreen.glossary')}
          </List.SubHeader>
          <Text style={[styles.caption, { color: theme.onSurfaceVariant }]}>
            {`${getString('translationScreen.glossaryCount')}: ${prefs.glossary.length}/${GLOSSARY_LIMIT}`}
          </Text>
          {prefs.glossary.map(entry => (
            <List.Item
              key={`${entry.term}→${entry.replacement}`}
              title={entry.term}
              description={entry.replacement}
              right="close"
              onPress={() =>
                update({
                  glossary: prefs.glossary.filter(
                    row =>
                      row.term !== entry.term ||
                      row.replacement !== entry.replacement,
                  ),
                })
              }
              theme={theme}
            />
          ))}
          <View style={styles.row}>
            <TextInput
              value={glossaryTerm}
              onChangeText={setGlossaryTerm}
              placeholder={getString('translationScreen.glossaryTerm')}
              placeholderTextColor={theme.onSurfaceVariant}
              style={[
                styles.input,
                styles.grow,
                { color: theme.onSurface, borderColor: theme.outline },
              ]}
            />
            <TextInput
              value={glossaryReplacement}
              onChangeText={setGlossaryReplacement}
              placeholder={getString('translationScreen.glossaryReplacement')}
              placeholderTextColor={theme.onSurfaceVariant}
              style={[
                styles.input,
                styles.grow,
                { color: theme.onSurface, borderColor: theme.outline },
              ]}
            />
            <IconButton
              icon="plus"
              onPress={addGlossaryEntry}
              disabled={prefs.glossary.length >= GLOSSARY_LIMIT}
            />
          </View>
          {prefs.glossary.length >= GLOSSARY_LIMIT && (
            <Text style={[styles.caption, { color: theme.error }]}>
              {getString('translationScreen.glossaryLimit')}
            </Text>
          )}

          <List.SubHeader theme={theme}>
            {getString('translationScreen.customInstruction')}
          </List.SubHeader>
          <TextInput
            value={customInstruction}
            onChangeText={setCustomInstruction}
            onBlur={() =>
              update({ customInstruction: customInstruction.trim() })
            }
            multiline
            textAlignVertical="top"
            placeholder={getString(
              'translationScreen.customInstructionPlaceholder',
            )}
            placeholderTextColor={theme.onSurfaceVariant}
            style={[
              styles.input,
              styles.multiline,
              { color: theme.onSurface, borderColor: theme.outline },
            ]}
          />

          <List.SubHeader theme={theme}>
            {getString('translationScreen.excludedHosts')}
          </List.SubHeader>
          {prefs.excludedHosts.map(host => (
            <List.Item
              key={host}
              title={host}
              right="close"
              onPress={() =>
                update({
                  excludedHosts: prefs.excludedHosts.filter(
                    row => row !== host,
                  ),
                })
              }
              theme={theme}
            />
          ))}
          <View style={styles.row}>
            <TextInput
              value={excludedHost}
              onChangeText={setExcludedHost}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onSubmitEditing={addExcludedHost}
              placeholder={getString('translationScreen.hostPlaceholder')}
              placeholderTextColor={theme.onSurfaceVariant}
              style={[
                styles.input,
                styles.grow,
                { color: theme.onSurface, borderColor: theme.outline },
              ]}
            />
            <IconButton icon="plus" onPress={addExcludedHost} />
          </View>

          <List.SubHeader theme={theme}>
            {getString('translationScreen.memoryHeader')}
          </List.SubHeader>
          <List.Item
            title={getString('translationScreen.memoryEntries')}
            description={
              memoryStats
                ? `${memoryStats.entries} · ${(
                    memoryStats.bytes / 1048576
                  ).toFixed(1)} MB`
                : getString('translationScreen.memoryLoading')
            }
            theme={theme}
          />
          <List.Item
            title={getString('translationScreen.memoryClear')}
            icon="delete-sweep-outline"
            onPress={() =>
              confirmRemoval(
                getString('translationScreen.memoryClearMessage'),
                () => {
                  void (async () => {
                    await memoryRef.current?.clear();
                    await refreshMemoryStats();
                    Alert.alert(
                      getString('translationScreen.memoryHeader'),
                      getString('translationScreen.memoryCleared'),
                    );
                  })();
                },
              )
            }
            theme={theme}
          />
        </List.Section>
      </ScrollView>

      <Dialog.Root
        visible={languageDialogVisible}
        onDismiss={() => setLanguageDialogVisible(false)}
      >
        <Dialog.Header>
          <Dialog.Title>
            {getString('translationScreen.targetLanguage')}
          </Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
            {TRANSLATION_LANGUAGES.map(([code, name]) => (
              <List.Item
                key={code}
                title={name}
                right={prefs.target === code ? 'check' : undefined}
                onPress={() => {
                  update({ target: code });
                  setLanguageDialogVisible(false);
                }}
                theme={theme}
              />
            ))}
          </ScrollView>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root
        visible={engineDialogVisible}
        onDismiss={() => setEngineDialogVisible(false)}
      >
        <Dialog.Header>
          <Dialog.Title>{getString('translationScreen.engine')}</Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
            {TRANSLATION_ENGINES.map(engine => (
              <List.Item
                key={engine.id}
                title={engine.title}
                right={prefs.engine === engine.id ? 'check' : undefined}
                onPress={() => {
                  update({ engine: engine.id });
                  setEngineDialogVisible(false);
                }}
                theme={theme}
              />
            ))}
          </ScrollView>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root
        visible={importDialogVisible}
        onDismiss={() => setImportDialogVisible(false)}
      >
        <Dialog.Header>
          <Dialog.Title>
            {getString('translationScreen.cloudflareImportTitle')}
          </Dialog.Title>
          <Dialog.Description>
            {getString('translationScreen.cloudflareImport')}
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Content>
          <TextInput
            value={importJson}
            onChangeText={setImportJson}
            multiline
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={getString('translationScreen.cloudflareImportJson')}
            placeholderTextColor={theme.onSurfaceVariant}
            style={[
              styles.input,
              styles.multiline,
              { color: theme.onSurface, borderColor: theme.outline },
            ]}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action
            title={getString('translationScreen.cancelAction')}
            onPress={() => setImportDialogVisible(false)}
          />
          <Dialog.Action
            title={getString('translationScreen.confirmAction')}
            onPress={importCloudflareConnection}
          />
        </Dialog.Actions>
      </Dialog.Root>

      {editorProvider && (
        <ProviderEditorDialog
          provider={editorProvider}
          secret={editorSecret}
          hasSecret={editorHasSecret}
          busy={busy}
          theme={theme}
          onChange={patch =>
            setEditorProvider(previous =>
              previous ? { ...previous, ...patch } : previous,
            )
          }
          onSecretChange={setEditorSecret}
          onDiscover={() => void discoverEditorModels()}
          onTest={() => void testEditorConnection()}
          onSelect={selectEditorProvider}
          onDelete={deleteEditorProvider}
          onSave={() => void saveEditor()}
          onClose={() => setEditorProvider(null)}
        />
      )}
    </SafeAreaView>
  );
};

export default SettingsTranslation;

const styles = StyleSheet.create({
  paddingBottom: {
    paddingBottom: 24,
  },
  input: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 16,
    marginTop: 8,
  },
  multiline: {
    minHeight: 96,
  },
  label: {
    fontSize: 14,
    marginTop: 12,
    marginHorizontal: 16,
  },
  caption: {
    fontSize: 12,
    marginTop: 6,
    marginHorizontal: 16,
  },
  badge: {
    fontSize: 12,
    marginTop: 4,
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
  },
  grow: {
    flex: 1,
  },
  pickerScroll: {
    maxHeight: 288,
  },
  editorScroll: {
    maxHeight: 432,
  },
  actionButton: {
    marginRight: 8,
    marginTop: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stepperText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
  },
  itemDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  stepperValue: {
    fontSize: 16,
    minWidth: 24,
    textAlign: 'center',
  },
});
