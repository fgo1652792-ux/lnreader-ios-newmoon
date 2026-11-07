// lnreader-ios/src/screens/settings/SettingsReaderScreen/useWorSettings.ts
//
// Single source of truth for the reader-settings screen's WOR controls: a
// useState snapshot of loadWorSettings() (the settings screen does not need a
// live MMKV subscription) + a `patch` writer that persists through
// saveWorSettingsPatch and mirrors the result in React state. The preview
// (WorPreview) subscribes to `settings` and forwards changes to the shell via
// the bridge — the same message flow the real reader uses.

import { useCallback, useMemo, useRef, useState } from 'react';

import {
  loadWorSettings,
  needsStructuralRebuild,
  saveWorSettingsPatch,
  type WorReaderSettings,
} from '@screens/reader/newmoon/NewMoonAdapter';

export type UseWorSettings = {
  /** Full, defaults-merged WOR settings object. */
  settings: WorReaderSettings;
  /** Persist a partial patch and update the state mirror. */
  patch: (partial: Partial<WorReaderSettings>) => void;
  /**
   * True when the last `patch` touched a structural key (quote/mark styles are
   * baked into the chapter HTML → the preview must re-send the chapter, never
   * reload its document).
   */
  lastPatchNeedsRebuild: boolean;
};

/** Props the screen passes down to the tabs (single hook instance upstairs). */
export type WorSettingsTabProps = {
  settings: WorReaderSettings;
  patch: (partial: Partial<WorReaderSettings>) => void;
};

export const useWorSettings = (): UseWorSettings => {
  const [settings, setSettings] = useState<WorReaderSettings>(() =>
    loadWorSettings(),
  );
  const [lastPatchNeedsRebuild, setLastPatchNeedsRebuild] = useState(false);
  /** Live mirror for the patch writer (state updaters must stay pure). */
  const settingsRef = useRef<WorReaderSettings>(settings);

  const patch = useCallback((partial: Partial<WorReaderSettings>) => {
    const previous = settingsRef.current;
    // Engine parity with NewMoonReaderScreen.applySettingsPatch: the
    // structural-rebuild decision compares the incoming values against the
    // CURRENT settings and must run BEFORE the merge.
    const needsRebuild = needsStructuralRebuild(
      partial as Record<string, unknown>,
      previous as unknown as Record<string, unknown>,
    );
    const next = { ...previous, ...partial };
    settingsRef.current = next;
    setSettings(next);
    setLastPatchNeedsRebuild(needsRebuild);
    saveWorSettingsPatch(partial);
  }, []);

  return useMemo(
    () => ({ settings, patch, lastPatchNeedsRebuild }),
    [settings, patch, lastPatchNeedsRebuild],
  );
};

export default useWorSettings;
