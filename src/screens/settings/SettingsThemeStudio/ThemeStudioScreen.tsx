import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Appbar as PaperAppbar } from 'react-native-paper';
import { setStringAsync } from 'expo-clipboard';

import MaterialIcon from '@react-native-vector-icons/material-design-icons';
import {
  Appbar,
  SafeAreaView,
  SegmentedControl,
  ConfirmationDialog,
} from '@components';
import Menu from '@components/Menu';
import type { SegmentedControlOption } from '@components/SegmentedControl';
import { getString } from '@i18n/translations';
import type { StringMap } from '@i18n/types';
import { showToast } from '@utils/showToast';
import { serializeThemeStudio, StudioUserTheme } from '@theme/studio/overrides';
import {
  TOKEN_CONTRAST_PARTNER,
  TOKEN_GROUPS,
  ThemeColorToken,
  type ThemeOverrides,
} from '@theme/studio/tokens';
import { ThemeStudioScreenProps } from '@navigators/types';
import { useTheme } from '@hooks/persisted';
import ColorEditorModal from './components/ColorEditorModal';
import ContrastPanel from './components/ContrastPanel';
import ImportThemeModal from './components/ImportThemeModal';
import PresetsSection from './components/PresetsSection';
import SaveThemeModal from './components/SaveThemeModal';
import ThemePreview from './components/ThemePreview';
import { TokenSection } from './components/TokenSection';
import UserThemesSection from './components/UserThemesSection';
import { StudioMode, useThemeStudioEditor } from './useThemeStudioEditor';

type ModeOption = SegmentedControlOption<StudioMode>;

const tokenLabel = (token: ThemeColorToken): string =>
  getString(`themeStudio.tokens.${token}` as keyof StringMap);

/**
 * Theme Studio («تخصيص المظهر») — per-token color editing on top of the
 * existing MD3 theme system. Edits stay in local draft state until applied;
 * the app-wide theme only re-renders when MMKV commits.
 */
const ThemeStudio = ({ navigation }: ThemeStudioScreenProps) => {
  const theme = useTheme();
  const editor = useThemeStudioEditor();

  const [editingToken, setEditingToken] = useState<ThemeColorToken | null>(
    null,
  );
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [renameTarget, setRenameTarget] = useState<StudioUserTheme | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<StudioUserTheme | null>(
    null,
  );
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);

  const modeOptions = useMemo<ModeOption[]>(
    () => [
      { value: 'light', label: getString('themeStudio.tabs.light') },
      { value: 'dark', label: getString('themeStudio.tabs.dark') },
    ],
    [],
  );

  const editingLabel = useMemo(
    () => (editingToken ? tokenLabel(editingToken) : ''),
    [editingToken],
  );

  const editingPartner = useMemo(() => {
    if (!editingToken) {
      return undefined;
    }
    const pair = TOKEN_CONTRAST_PARTNER[editingToken];
    if (!pair) {
      return undefined;
    }
    return {
      label: tokenLabel(pair.bg),
      hex: editor.effectiveColors[pair.bg],
      min: pair.min,
    };
  }, [editingToken, editor.effectiveColors]);

  const handleExport = useCallback(async () => {
    const json = serializeThemeStudio(editor.targetName, {
      light: editor.drafts.light ?? {},
      dark: editor.drafts.dark ?? {},
    });
    try {
      await setStringAsync(json);
      showToast(getString('themeStudio.export.copied'));
    } catch {
      showToast(getString('themeStudio.export.failed'));
    }
  }, [editor.drafts, editor.targetName]);

  const handleSaveNamed = useCallback(
    (name: string) => {
      editor.saveDraftsAsTheme(name);
      showToast(getString('themeStudio.savedToast', { name }));
    },
    [editor],
  );

  const handleImport = useCallback(
    (name: string, overrides: ThemeOverrides) => {
      const id = editor.storage.saveTheme(name, overrides);
      editor.storage.setActiveId(id);
      showToast(getString('themeStudio.imported.success', { name }));
    },
    [editor],
  );

  const handleDelete = useCallback(
    (target: StudioUserTheme) => {
      editor.storage.deleteTheme(target.id);
      showToast(getString('themeStudio.deletedToast', { name: target.name }));
    },
    [editor],
  );

  const handleDuplicate = useCallback(
    (target: StudioUserTheme) => {
      const newId = editor.storage.duplicateTheme(
        target.id,
        `${target.name} (${getString('themeStudio.userThemes.copySuffix')})`,
      );
      if (newId) {
        editor.storage.setActiveId(newId);
      }
    },
    [editor],
  );

  const handleResetMode = useCallback(() => {
    editor.resetMode(editor.mode);
    showToast(getString('themeStudio.resetToast'));
  }, [editor]);

  const handleResetAll = useCallback(() => {
    editor.resetAll();
    showToast(getString('themeStudio.resetToast'));
  }, [editor]);

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('themeStudio.title')}
        handleGoBack={navigation.goBack}
        theme={theme}
      >
        <PaperAppbar.Action
          icon="content-save"
          onPress={() => setSaveModalVisible(true)}
          accessibilityLabel={getString('themeStudio.actions.save')}
          color={theme.onSurface}
        />
        <PaperAppbar.Action
          icon="download"
          onPress={() => setImportModalVisible(true)}
          accessibilityLabel={getString('themeStudio.actions.import')}
          color={theme.onSurface}
        />
        <PaperAppbar.Action
          icon="upload"
          onPress={handleExport}
          accessibilityLabel={getString('themeStudio.actions.export')}
          color={theme.onSurface}
        />
        <Menu
          visible={moreMenuVisible}
          onDismiss={() => setMoreMenuVisible(false)}
          anchor={
            <PaperAppbar.Action
              icon="dots-vertical"
              accessibilityLabel={getString('common.moreOptions')}
              color={theme.onSurface}
              onPress={() => setMoreMenuVisible(true)}
            />
          }
        >
          <Menu.Item
            title={getString('themeStudio.actions.resetMode')}
            onPress={() => {
              setMoreMenuVisible(false);
              handleResetMode();
            }}
          />
          <Menu.Item
            title={getString('themeStudio.actions.resetAll')}
            onPress={() => {
              setMoreMenuVisible(false);
              handleResetAll();
            }}
          />
        </Menu>
      </Appbar>

      <ScrollView style={styles.flex1} contentContainerStyle={styles.content}>
        {/* Editing target + unsaved banner */}
        <View
          style={[styles.targetCard, { backgroundColor: theme.surfaceVariant }]}
        >
          <Text style={[styles.targetText, { color: theme.onSurfaceVariant }]}>
            {getString('themeStudio.editingOnTopOf', {
              name: editor.targetName,
            })}
          </Text>
          {editor.hasUnsavedChanges ? (
            <View style={styles.unsavedRow}>
              <MaterialIcon name="alert-circle" size={14} color={theme.error} />
              <Text style={[styles.unsavedText, { color: theme.error }]}>
                {getString('themeStudio.unsaved.banner')}
              </Text>
              <PaperAppbar.Action
                icon="content-save"
                size={18}
                onPress={() => setSaveModalVisible(true)}
                accessibilityLabel={getString('themeStudio.unsaved.saveNow')}
                color={theme.primary}
              />
            </View>
          ) : null}
        </View>

        {/* Live preview — consumes the local merged colors */}
        <View style={styles.previewSection}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>
            {getString('themeStudio.preview.title')}
          </Text>
          <ThemePreview
            colors={editor.effectiveColors}
            isDark={editor.mode === 'dark'}
          />
        </View>

        {/* Light / dark editing */}
        <View style={styles.modeSwitch}>
          <SegmentedControl
            options={modeOptions}
            value={editor.mode}
            onChange={editor.setMode}
            theme={theme}
          />
        </View>

        {TOKEN_GROUPS.map(group => (
          <TokenSection
            key={group.id}
            group={group}
            effectiveColors={editor.effectiveColors}
            isOverridden={editor.isOverridden}
            theme={theme}
            onPressToken={setEditingToken}
          />
        ))}

        <ContrastPanel colors={editor.effectiveColors} theme={theme} />

        <PresetsSection
          presets={editor.presets}
          activeId={editor.activeId}
          theme={theme}
          onSelect={editor.activatePreset}
          onDeactivate={editor.deactivate}
        />

        <UserThemesSection
          themes={editor.storage.userThemes}
          activeId={editor.activeId}
          theme={theme}
          onActivate={editor.storage.setActiveId}
          onRename={setRenameTarget}
          onDuplicate={handleDuplicate}
          onDelete={setDeleteTarget}
        />
      </ScrollView>

      {/* Color editor — keyed per token so it re-initializes cleanly */}
      {editingToken ? (
        <ColorEditorModal
          key={editingToken}
          visible
          label={editingLabel}
          initialHex={editor.effectiveToken(editingToken)}
          partnerLabel={editingPartner?.label}
          partnerHex={editingPartner?.hex}
          partnerMin={editingPartner?.min}
          theme={theme}
          onApply={hex => editor.setTokenOverride(editingToken, hex)}
          onDismiss={() => setEditingToken(null)}
        />
      ) : null}

      <SaveThemeModal
        key={`save-${saveModalVisible}`}
        visible={saveModalVisible}
        theme={theme}
        defaultName={editor.targetName}
        onDismiss={() => setSaveModalVisible(false)}
        onSave={handleSaveNamed}
      />

      <ImportThemeModal
        key={`import-${importModalVisible}`}
        visible={importModalVisible}
        theme={theme}
        onDismiss={() => setImportModalVisible(false)}
        onImport={handleImport}
      />

      <SaveThemeModal
        key={`rename-${renameTarget?.id ?? 'none'}-${renameTarget !== null}`}
        visible={renameTarget !== null}
        theme={theme}
        defaultName={renameTarget?.name ?? ''}
        title={getString('themeStudio.userThemes.renameTitle')}
        confirmLabel={getString('common.save')}
        onDismiss={() => setRenameTarget(null)}
        onSave={name => {
          if (renameTarget) {
            editor.storage.renameTheme(renameTarget.id, name);
          }
        }}
      />

      <ConfirmationDialog
        title={getString('themeStudio.userThemes.deleteTitle')}
        message={getString('themeStudio.userThemes.deleteMessage', {
          name: deleteTarget?.name ?? '',
        })}
        visible={deleteTarget !== null}
        confirmLabel={getString('common.delete')}
        onConfirm={() => {
          if (deleteTarget) {
            handleDelete(deleteTarget);
          }
        }}
        onDismiss={() => setDeleteTarget(null)}
      />
    </SafeAreaView>
  );
};

export default ThemeStudio;

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
    paddingHorizontal: 14,
  },
  targetCard: {
    borderRadius: 14,
    gap: 6,
    padding: 12,
    marginTop: 8,
  },
  targetText: {
    fontSize: 13,
  },
  unsavedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  unsavedText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  previewSection: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginStart: 4,
  },
  modeSwitch: {
    marginTop: 16,
  },
});
