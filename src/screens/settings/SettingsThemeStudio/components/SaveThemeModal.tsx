import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { TextInput } from 'react-native-paper';

import { Dialog } from '@components';
import { getString } from '@i18n/translations';
import type { ThemeColors } from '@theme/types';

interface SaveThemeModalProps {
  visible: boolean;
  theme: ThemeColors;
  /** Default name (current target name). */
  defaultName: string;
  /** Dialog title — also reused for renaming user themes. */
  title?: string;
  confirmLabel?: string;
  onDismiss: () => void;
  onSave: (name: string) => void;
}

/** Names and saves the current drafts as a user theme. */
const SaveThemeModal = ({
  visible,
  theme,
  defaultName,
  title,
  confirmLabel,
  onDismiss,
  onSave,
}: SaveThemeModalProps) => {
  // Remounted per open (parent passes key={visible}) so the name field is
  // pre-filled without a reset effect.
  const [name, setName] = useState(defaultName);

  const trimmed = name.trim();

  return (
    <Dialog.Root visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>
        {title ?? getString('themeStudio.saveModal.title')}
      </Dialog.Title>
      <Dialog.Content>
        <TextInput
          value={name}
          mode="outlined"
          dense
          autoCorrect={false}
          label={getString('themeStudio.saveModal.nameLabel')}
          onChangeText={setName}
          onSubmitEditing={() => {
            if (trimmed) {
              onSave(trimmed);
              onDismiss();
            }
          }}
          outlineColor={theme.outline}
          activeOutlineColor={theme.primary}
          textColor={theme.onSurface}
          style={styles.input}
        />
        <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
          {getString('themeStudio.saveModal.hint')}
        </Text>
      </Dialog.Content>
      <Dialog.Actions>
        <Dialog.Action title={getString('common.cancel')} onPress={onDismiss} />
        <Dialog.Action
          title={confirmLabel ?? getString('common.save')}
          disabled={!trimmed}
          onPress={() => {
            onSave(trimmed);
            onDismiss();
          }}
        />
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default SaveThemeModal;

const styles = StyleSheet.create({
  input: {
    backgroundColor: 'transparent',
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
  },
});
