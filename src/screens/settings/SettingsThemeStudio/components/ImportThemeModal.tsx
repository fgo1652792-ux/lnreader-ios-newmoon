import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { TextInput } from 'react-native-paper';

import { Dialog } from '@components';
import { getString } from '@i18n/translations';
import type { StringMap } from '@i18n/types';
import {
  parseThemeStudio,
  ParseThemeStudioError,
} from '@theme/studio/overrides';
import type { ThemeOverrides } from '@theme/studio/tokens';
import type { ThemeColors } from '@theme/types';

interface ImportThemeModalProps {
  visible: boolean;
  theme: ThemeColors;
  onDismiss: () => void;
  onImport: (name: string, overrides: ThemeOverrides) => void;
}

const ERROR_KEYS: Record<ParseThemeStudioError, string> = {
  empty: 'themeStudio.importModal.errorEmpty',
  'invalid-json': 'themeStudio.importModal.errorInvalidJson',
  'unknown-format': 'themeStudio.importModal.errorUnknownFormat',
  'unsupported-version': 'themeStudio.importModal.errorUnsupportedVersion',
};

/** Paste-JSON import with strict, versioned validation. */
const ImportThemeModal = ({
  visible,
  theme,
  onDismiss,
  onImport,
}: ImportThemeModalProps) => {
  // Remounted per open (parent passes key={visible}) — fresh state, no
  // reset effect needed.
  const [text, setText] = useState('');
  const [error, setError] = useState<ParseThemeStudioError | null>(null);

  const submit = () => {
    const result = parseThemeStudio(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onImport(result.value.name, {
      light: result.value.light,
      dark: result.value.dark,
    });
    onDismiss();
  };

  return (
    <Dialog.Root visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>{getString('themeStudio.importModal.title')}</Dialog.Title>
      <Dialog.Content>
        <TextInput
          value={text}
          mode="outlined"
          multiline
          numberOfLines={6}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={getString('themeStudio.importModal.placeholder')}
          onChangeText={text_ => {
            setText(text_);
            setError(null);
          }}
          outlineColor={theme.outline}
          activeOutlineColor={theme.primary}
          textColor={theme.onSurface}
          style={styles.input}
        />
        {error ? (
          <Text style={[styles.error, { color: theme.error }]}>
            {getString(ERROR_KEYS[error] as keyof StringMap)}
          </Text>
        ) : null}
      </Dialog.Content>
      <Dialog.Actions>
        <Dialog.Action title={getString('common.cancel')} onPress={onDismiss} />
        <Dialog.Action
          title={getString('themeStudio.importModal.submit')}
          onPress={submit}
        />
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default ImportThemeModal;

const styles = StyleSheet.create({
  input: {
    backgroundColor: 'transparent',
    fontSize: 12,
  },
  error: {
    fontSize: 13,
    marginTop: 8,
  },
});
