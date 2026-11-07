// lnreader-ios/src/screens/settings/SettingsAppearanceScreen/ThemeCustomizerScreen.tsx
//
// «تخصيص المظهر» — advanced appearance editor, separate from the reader
// settings. Built on the MD3 token system:
//  • per-token colors with an interactive picker (not just HEX input)
//  • a LIVE preview (library snippet + nav bar + reader surface) that re-
//    renders with every change — the whole app never re-renders per drag
//    (overrides land in MMKV on commit)
//  • separate light/dark editing (independent override sets)
//  • WCAG AA contrast warnings for text/background pairs
//  • named saved themes (apply/delete), reset, JSON export/import

import { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { TextInput as PaperTextInput } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';

import {
  Appbar,
  Button,
  ColorPreferenceItem,
  ConfirmationDialog,
  Dialog,
  SafeAreaView,
} from '@components/index';
import ColorPickerModal from '@components/ColorPickerModal/ColorPickerModal';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import type { StringMap } from '@i18n/types';
import { showToast } from '@utils/showToast';
import {
  contrastRatio,
  deleteCustomThemePreset,
  listSavedCustomThemes,
  loadCustomOverrides,
  MIN_TEXT_CONTRAST,
  resetCustomOverrides,
  saveCustomOverrides,
  saveCustomThemePreset,
  sanitizeOverrides,
  type CustomThemeOverrides,
  type CustomThemeOverridesByMode,
  type SavedCustomTheme,
} from '@theme/customTheme';
import type { MD3ThemeType } from '@theme/types';

type EditMode = 'light' | 'dark';

type TokenGroup = {
  titleKey: string;
  tokens: { key: keyof MD3ThemeType; labelKey: string; contrastWith?: keyof MD3ThemeType }[];
};

const TOKEN_GROUPS: TokenGroup[] = [
  {
    titleKey: 'appearanceCustom.groupSurfaces',
    tokens: [
      { key: 'background', labelKey: 'appearanceCustom.background' },
      { key: 'surface', labelKey: 'appearanceCustom.surface' },
      { key: 'surfaceVariant', labelKey: 'appearanceCustom.surfaceVariant' },
      { key: 'onSurface', labelKey: 'appearanceCustom.onSurface', contrastWith: 'surface' },
      {
        key: 'onSurfaceVariant',
        labelKey: 'appearanceCustom.onSurfaceVariant',
        contrastWith: 'surfaceVariant',
      },
      { key: 'outline', labelKey: 'appearanceCustom.outline' },
      { key: 'outlineVariant', labelKey: 'appearanceCustom.outlineVariant' },
    ],
  },
  {
    titleKey: 'appearanceCustom.groupIdentity',
    tokens: [
      { key: 'primary', labelKey: 'appearanceCustom.primary' },
      { key: 'onPrimary', labelKey: 'appearanceCustom.onPrimary', contrastWith: 'primary' },
      { key: 'primaryContainer', labelKey: 'appearanceCustom.primaryContainer' },
      { key: 'secondary', labelKey: 'appearanceCustom.secondary' },
      { key: 'tertiary', labelKey: 'appearanceCustom.tertiary' },
    ],
  },
  {
    titleKey: 'appearanceCustom.groupStates',
    tokens: [
      { key: 'error', labelKey: 'appearanceCustom.error' },
      { key: 'onError', labelKey: 'appearanceCustom.onError', contrastWith: 'error' },
    ],
  },
];

const ThemeCustomizerScreen = () => {
  const navigation = useNavigation();
  const theme = useTheme();

  const [overrides, setOverrides] = useState<CustomThemeOverridesByMode>(
    loadCustomOverrides,
  );
  const [editMode, setEditMode] = useState<EditMode>(
    theme.isDark ? 'dark' : 'light',
  );
  const [pickerToken, setPickerToken] = useState<keyof MD3ThemeType | null>(
    null,
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [saveDialog, setSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [importDialog, setImportDialog] = useState(false);
  const [importText, setImportText] = useState('');
  const [saved, setSaved] = useState<SavedCustomTheme[]>(listSavedCustomThemes);

  const current = overrides[editMode];

  const commit = useCallback(
    (next: CustomThemeOverridesByMode) => {
      setOverrides(next);
      saveCustomOverrides(next);
    },
    [],
  );

  const setToken = useCallback(
    (token: keyof MD3ThemeType, value: string | undefined) => {
      const nextMode: CustomThemeOverrides = { ...current };
      if (value) {
        nextMode[token] = value;
      } else {
        delete nextMode[token];
      }
      commit({ ...overrides, [editMode]: nextMode });
    },
    [commit, current, editMode, overrides],
  );

  const currentOverrideCount = Object.keys(current).length;

  const contrastWarningFor = useCallback(
    (contrastWith?: keyof MD3ThemeType, tokenValue?: string) => {
      if (!contrastWith) {
        return false;
      }
      // The PAIR is: overridden background token vs overridden text token.
      const bg =
        overrides[editMode][contrastWith] ??
        (theme as unknown as Record<string, string>)[contrastWith];
      const fg = tokenValue;
      if (!bg || !fg) {
        return false;
      }
      return contrastRatio(fg, bg) < MIN_TEXT_CONTRAST;
    },
    [editMode, overrides, theme],
  );

  // ------------------------------------------------------------- preview ---
  const previewColors = useMemo(() => {
    const pick = (token: keyof MD3ThemeType, fallback: string) =>
      overrides[editMode][token] ?? fallback;
    return {
      background: pick('background', theme.background),
      surface: pick('surface', theme.surface),
      surfaceVariant: pick('surfaceVariant', theme.surfaceVariant),
      onSurface: pick('onSurface', theme.onSurface),
      onSurfaceVariant: pick('onSurfaceVariant', theme.onSurfaceVariant),
      outline: pick('outline', theme.outline),
      outlineVariant: pick('outlineVariant', theme.outlineVariant),
      primary: pick('primary', theme.primary),
      onPrimary: pick('onPrimary', theme.onPrimary),
      secondary: pick('secondary', theme.secondary ?? theme.primary),
      error: pick('error', theme.error),
    };
  }, [editMode, overrides, theme]);

  const applySavedTheme = useCallback(
    (entry: SavedCustomTheme) => {
      commit({ ...overrides, [editMode]: entry[editMode] });
      showToast(getString('appearanceCustom.applied', { name: entry.name }));
    },
    [commit, editMode, overrides],
  );

  const handleSave = useCallback(() => {
    const name = saveName.trim();
    if (!name) {
      return;
    }
    setSaved(saveCustomThemePreset(name, overrides));
    setSaveName('');
    setSaveDialog(false);
    showToast(getString('appearanceCustom.saved'));
  }, [overrides, saveName]);

  const handleExport = useCallback(async () => {
    const payload = JSON.stringify({ [editMode]: current }, null, 2);
    await Clipboard.setStringAsync(payload);
    showToast(getString('appearanceCustom.exported'));
  }, [current, editMode]);

  const handleImport = useCallback(() => {
    try {
      const parsed = JSON.parse(importText) as CustomThemeOverridesByMode;
      const light = sanitizeOverrides(parsed.light ?? parsed);
      const dark = sanitizeOverrides(parsed.dark ?? parsed);
      if (editMode === 'light' && Object.keys(light).length) {
        commit({ ...overrides, light });
      } else if (editMode === 'dark' && Object.keys(dark).length) {
        commit({ ...overrides, dark });
      } else {
        showToast(getString('appearanceCustom.importInvalid'));
      }
    } catch {
      showToast(getString('appearanceCustom.importInvalid'));
    }
    setImportText('');
    setImportDialog(false);
  }, [commit, editMode, importText, overrides]);

  return (
    <SafeAreaView excludeTop style={styles.container}>
      <Appbar
        mode="small"
        title={getString('appearanceCustom.title')}
        handleGoBack={navigation.goBack}
        theme={theme}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Mode switch + reset */}
        <View style={styles.modeRow}>
          {(['light', 'dark'] as EditMode[]).map(mode => {
            const active = editMode === mode;
            return (
              <Text
                key={mode}
                onPress={() => setEditMode(mode)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.modeChip,
                  {
                    backgroundColor: active
                      ? theme.primary
                      : theme.surfaceVariant,
                    color: active ? theme.onPrimary : theme.onSurfaceVariant,
                  },
                ]}
              >
                {getString(
                  mode === 'light'
                    ? 'appearanceCustom.modeLight'
                    : 'appearanceCustom.modeDark',
                )}
              </Text>
            );
          })}
          <View style={{ flex: 1 }} />
          <Text
            onPress={handleExport}
            accessibilityRole="button"
            style={[styles.actionText, { color: theme.primary }]}
          >
            {getString('appearanceCustom.export')}
          </Text>
          <Text
            onPress={() => setImportDialog(true)}
            accessibilityRole="button"
            style={[styles.actionText, { color: theme.primary }]}
          >
            {getString('appearanceCustom.import')}
          </Text>
        </View>

        {/* LIVE preview */}
        <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>
          {getString('appearanceCustom.preview')}
        </Text>
        <View
          style={[styles.preview, { backgroundColor: previewColors.background }]}
        >
          {/* library app bar strip */}
          <View
            style={[
              styles.previewAppBar,
              { backgroundColor: previewColors.surface },
            ]}
          >
            <View
              style={[styles.previewDot, { backgroundColor: previewColors.primary }]}
            />
            <Text
              style={{ color: previewColors.onSurface, fontWeight: '800', fontSize: 13 }}
            >
              {getString('appearanceCustom.previewLibrary')}
            </Text>
            <View style={{ flex: 1 }} />
            <View
              style={[
                styles.previewPill,
                { backgroundColor: previewColors.surfaceVariant },
              ]}
            />
          </View>
          {/* novel grid */}
          <View style={styles.previewGrid}>
            {[0, 1, 2].map(i => (
              <View
                key={i}
                style={[
                  styles.previewCard,
                  { backgroundColor: previewColors.surfaceVariant },
                ]}
              >
                <View style={[styles.previewCover, { backgroundColor: previewColors.secondary + '55' }]} />
                <View style={[styles.previewLine, { backgroundColor: previewColors.onSurface + 'AA' }]} />
                <View style={[styles.previewLineShort, { backgroundColor: previewColors.onSurfaceVariant }]} />
              </View>
            ))}
          </View>
          {/* reader snippet */}
          <View
            style={[styles.previewReader, { backgroundColor: previewColors.background }]}
          >
            <Text
              style={{
                color: previewColors.onSurface,
                fontSize: 13,
                lineHeight: 20,
                writingDirection: 'rtl',
                textAlign: 'right',
              }}
              numberOfLines={2}
            >
              معاينة حية: هكذا سيظهر نص القراءة بعد تخصيص الألوان في هذا الوضع.
            </Text>
          </View>
          {/* bottom nav */}
          <View
            style={[styles.previewNavBar, { backgroundColor: previewColors.surface }]}
          >
            {[0, 1, 2, 3].map(i => (
              <View
                key={i}
                style={[
                  styles.previewNavDot,
                  {
                    backgroundColor:
                      i === 0 ? previewColors.primary : previewColors.onSurfaceVariant,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {/* Saved themes */}
        {saved.length ? (
          <>
            <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>
              {getString('appearanceCustom.savedThemes')}
            </Text>
            <View style={styles.savedRow}>
              {saved.map(entry => (
                <View
                  key={entry.id}
                  style={[
                    styles.savedChip,
                    { backgroundColor: theme.surfaceVariant },
                  ]}
                >
                  <Text
                    onPress={() => applySavedTheme(entry)}
                    style={{ color: theme.onSurface, fontWeight: '700', fontSize: 12 }}
                  >
                    {entry.name}
                  </Text>
                  <Text
                    onPress={() => setSaved(deleteCustomThemePreset(entry.id))}
                    style={{ color: theme.error ?? theme.onSurfaceVariant, paddingHorizontal: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={getString('appearanceCustom.deleteSaved')}
                  >
                    ×
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Token groups */}
        {TOKEN_GROUPS.map(group => (
          <View key={group.titleKey}>
            <Text style={[styles.sectionTitle, { color: theme.primary }]}>
              {getString(group.titleKey as keyof StringMap)}
            </Text>
            {group.tokens.map(token => {
              const value = overrides[editMode][token.key];
              const effective = value ?? (theme as unknown as Record<string, string>)[token.key];
              const warning = contrastWarningFor(token.contrastWith, value);
              return (
                <ColorPreferenceItem
                  key={token.key}
                  theme={theme}
                  label={
                    getString(token.labelKey as keyof StringMap) +
                    (value ? ' ●' : '') +
                    (warning
                      ? ` ⚠ ${getString('appearanceCustom.lowContrast')}`
                      : '')
                  }
                  description={effective}
                  onPress={() => setPickerToken(token.key)}
                />
              );
            })}
          </View>
        ))}

        <View style={styles.actions}>
          <Button
            title={getString('appearanceCustom.saveAs')}
            onPress={() => setSaveDialog(true)}
          />
          <Button
            title={getString('appearanceCustom.resetMode')}
            onPress={() => setConfirmReset(true)}
          />
        </View>
        <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
          {getString('appearanceCustom.activeHint', {
            count: currentOverrideCount,
          })}
        </Text>
      </ScrollView>

      {/* Token color picker */}
      <ColorPickerModal
        visible={pickerToken !== null}
        title={
          pickerToken
            ? getString(
                (TOKEN_GROUPS.flatMap(g => g.tokens).find(
                  t => t.key === pickerToken,
                )?.labelKey ?? 'appearanceCustom.title') as keyof StringMap,
              )
            : ''
        }
        color={
          pickerToken
            ? overrides[editMode][pickerToken] ??
              (theme as unknown as Record<string, string>)[pickerToken]
            : '#000000'
        }
        onSubmit={value => {
          if (pickerToken) {
            setToken(pickerToken, value);
          }
          setPickerToken(null);
        }}
        closeModal={() => setPickerToken(null)}
        theme={theme}
      />

      {/* Reset confirmation */}
      <ConfirmationDialog
        visible={confirmReset}
        title={getString('appearanceCustom.resetTitle')}
        message={getString('appearanceCustom.resetMessage', {
          mode: getString(
            editMode === 'light'
              ? 'appearanceCustom.modeLight'
              : 'appearanceCustom.modeDark',
          ),
        })}
        confirmLabel={getString('appearanceCustom.resetMode')}
        onConfirm={() => {
          resetCustomOverrides(editMode);
          commit({ ...overrides, [editMode]: {} });
        }}
        onDismiss={() => setConfirmReset(false)}
      />

      {/* Save preset dialog */}
      <Dialog.Root visible={saveDialog} onDismiss={() => setSaveDialog(false)}>
        <Dialog.Header>
          <Dialog.Title>{getString('appearanceCustom.saveAs')}</Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          <PaperTextInput
            value={saveName}
            onChangeText={setSaveName}
            placeholder={getString('appearanceCustom.themeName')}
            mode="outlined"
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setSaveDialog(false)}>
            {getString('common.cancel')}
          </Dialog.Action>
          <Dialog.Action onPress={handleSave}>
            {getString('common.save')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>

      {/* Import dialog */}
      <Dialog.Root visible={importDialog} onDismiss={() => setImportDialog(false)}>
        <Dialog.Header>
          <Dialog.Title>{getString('appearanceCustom.import')}</Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          <PaperTextInput
            value={importText}
            onChangeText={setImportText}
            placeholder='{"light": {"primary": "#7a5c2e"}}'
            mode="outlined"
            multiline
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setImportDialog(false)}>
            {getString('common.cancel')}
          </Dialog.Action>
          <Dialog.Action onPress={handleImport}>
            {getString('common.save')}
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>
    </SafeAreaView>
  );
};

export default ThemeCustomizerScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 6 },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    fontSize: 13,
    fontWeight: '800',
    overflow: 'hidden',
  },
  actionText: { paddingHorizontal: 10, fontWeight: '700', fontSize: 13 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  preview: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  previewAppBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  previewDot: { width: 14, height: 14, borderRadius: 7 },
  previewPill: { width: 54, height: 12, borderRadius: 6 },
  previewGrid: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  previewCard: {
    flex: 1,
    borderRadius: 10,
    padding: 8,
    gap: 6,
  },
  previewCover: { height: 52, borderRadius: 8 },
  previewLine: { height: 6, borderRadius: 3, width: '85%' },
  previewLineShort: { height: 6, borderRadius: 3, width: '55%' },
  previewReader: { padding: 14, paddingTop: 6 },
  previewNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
  },
  previewNavDot: { width: 20, height: 20, borderRadius: 10 },
  savedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  savedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  hint: { fontSize: 12, marginTop: 8 },
});
