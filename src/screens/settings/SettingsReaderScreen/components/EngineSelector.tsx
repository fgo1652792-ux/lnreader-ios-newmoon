import { View, StyleSheet, Text } from 'react-native';
import { useCallback } from 'react';

import { RadioButton } from '@components';
import { getString } from '@i18n/translations';
import { useTheme } from '@hooks/persisted';
import { ThemeColors } from '@theme/types';

import {
  getReaderEngine,
  setReaderEngine,
  type ReaderEngine,
} from '../../../reader/newmoon/engineSetting';

type EngineOption = {
  value: ReaderEngine;
  labelKey: 'readerSettings.engineNewMoon' | 'readerSettings.engineClassic';
};

const ENGINES: EngineOption[] = [
  { value: 'wor', labelKey: 'readerSettings.engineNewMoon' },
  { value: 'classic', labelKey: 'readerSettings.engineClassic' },
];

/**
 * Reader-engine picker (New-moon ⟷ Classic). The engine is read when a
 * chapter screen mounts, so switching here applies on the next chapter open —
 * the live preview on this screen keeps the classic reader.
 */
export default function EngineSelector() {
  const theme: ThemeColors = useTheme();

  const select = useCallback((value: ReaderEngine) => {
    setReaderEngine(value);
  }, []);

  const current = getReaderEngine();

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <Text style={[styles.title, { color: theme.onSurface }]}>
        {getString('readerSettings.engine')}
      </Text>
      <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
        {getString('readerSettings.engineDescription')}
      </Text>
      <View style={styles.rows}>
        {ENGINES.map(engine => (
          <RadioButton
            key={engine.value}
            label={getString(engine.labelKey)}
            status={current === engine.value}
            onPress={() => select(engine.value)}
            theme={theme}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    marginTop: 2,
  },
  rows: {
    marginTop: 6,
  },
});
