// lnreader-ios/src/screens/settings/SettingsReaderScreen/Modals/WorFontPickerModal.tsx
//
// Font picker bound to the WOR engine's own font list (worFonts.js — the same
// list the reader dock renders). Replaces the classic FontPickerModal whose
// `readerFonts` values are meaningless to the New Moon engine.

import React from 'react';

import { Dialog, RadioButton } from '@components';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';

import { WOR_FONTS } from '../../../../reader/newmoon/worFonts';
import type { WorReaderSettings } from '@screens/reader/newmoon/NewMoonAdapter';

interface WorFontPickerModalProps {
  visible: boolean;
  onDismiss: () => void;
  currentFont: WorReaderSettings['fontValue'];
  onSelect: (fontValue: WorReaderSettings['fontValue']) => void;
}

const WorFontPickerModal: React.FC<WorFontPickerModalProps> = ({
  visible,
  onDismiss,
  currentFont,
  onSelect,
}) => {
  const theme = useTheme();

  return (
    <Dialog.Root visible={visible} onDismiss={onDismiss}>
      <Dialog.Title>
        {getString('newMoon.settingsFont')}
      </Dialog.Title>
      <Dialog.List>
        {WOR_FONTS.map(item => (
          <RadioButton
            key={item.value}
            status={currentFont === item.value}
            onPress={() => {
              onSelect(item.value);
              onDismiss();
            }}
            label={item.name}
            theme={theme}
          />
        ))}
      </Dialog.List>
      <Dialog.Actions>
        <Dialog.Action onPress={onDismiss}>
          {getString('common.ok')}
        </Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default WorFontPickerModal;
