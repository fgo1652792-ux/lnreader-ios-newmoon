// lnreader-ios/src/screens/reader/newmoon/settingsMigration.ts
//
// ONE-TIME migration of the legacy classic-reader settings into the New Moon
// reader settings (@wor_reader_settings_v4). Runs on the reader-settings
// screen mount (and is safe to call anywhere); every value is TYPE-CHECKED
// and clamped before it is copied — a corrupted or foreign payload can never
// poison the New Moon store.
//
// Mapped (legacy CHAPTER_READER_SETTINGS → wor):
//   textSize  → fontSize        (number, 12..32)
//   lineHeight→ lineHeight     (number, 1..3.5)
//   fontFamily→ fontValue      (matched against WOR_FONTS ids, else 'default')
//   textAlign → direction      ('left'→'ltr', 'right'→'rtl', 'center'→'center')
//   theme/textColor → bgPreset + bgColor/textColor (matched against WOR_BG_PRESETS,
//   else customColors=true with the exact colors)
//
// NOT migrated (no New Moon equivalent — stay with the legacy store):
//   tts.rate / tts.pitch are READ (type-checked) by the reader screen for the
//   native TTS bar, so the user's voice settings keep working.

import { MMKVStorage, getMMKVObject } from '@utils/mmkv/mmkv';
import {
  CHAPTER_READER_SETTINGS,
  initialChapterReaderSettings,
} from '@hooks/persisted/useSettings';
import { WOR_BG_PRESETS } from '../../../reader/newmoon/worShell';
import { WOR_FONTS } from '../../../reader/newmoon/worFonts';
import {
  loadWorSettings,
  saveWorSettingsPatch,
  type WorReaderSettings,
} from './NewMoonAdapter';

export const WOR_MIGRATION_FLAG = '@wor_settings_migrated_v1';

// --------------------------------------------------------------- helpers ---
const asNumber = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
};

const asHexColor = (v: unknown): string | null =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : null;

const asOneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : null;

// ------------------------------------------------------------- pure map ---
export type LegacyReaderSettingsLike = {
  textSize?: unknown;
  lineHeight?: unknown;
  fontFamily?: unknown;
  textAlign?: unknown;
  theme?: unknown;
  textColor?: unknown;
};

/**
 * Pure mapping — unit-tested. Returns the subset of WOR settings that can be
 * confidently migrated from the legacy payload (empty object when nothing
 * matches).
 */
export const mapLegacyToWorSettings = (
  legacy: LegacyReaderSettingsLike | null | undefined,
): Partial<WorReaderSettings> => {
  if (!legacy || typeof legacy !== 'object') {
    return {};
  }
  const patch: Record<string, unknown> = {};

  const fontSize = asNumber(legacy.textSize, 12, 32, NaN);
  if (Number.isFinite(fontSize)) {
    patch.fontSize = fontSize;
  }

  const lineHeight = asNumber(legacy.lineHeight, 1, 3.5, NaN);
  if (Number.isFinite(lineHeight)) {
    patch.lineHeight = lineHeight;
  }

  if (typeof legacy.fontFamily === 'string' && legacy.fontFamily.trim()) {
    const needle = legacy.fontFamily.trim().toLowerCase();
    const match = WOR_FONTS.find(
      f =>
        String(f.value).toLowerCase() === needle ||
        String(f.family).toLowerCase() === needle ||
        String(f.name) === legacy.fontFamily,
    );
    patch.fontValue = match ? match.value : 'default';
  }

  const direction = asOneOf(
    legacy.textAlign,
    ['left', 'right', 'center'] as const,
  );
  if (direction) {
    patch.direction =
      direction === 'left' ? 'ltr' : direction === 'right' ? 'rtl' : 'center';
  }

  const bg = asHexColor(legacy.theme);
  const fg = asHexColor(legacy.textColor);
  if (bg) {
    const preset = WOR_BG_PRESETS.find(
      p => p.bg.toLowerCase() === bg.toLowerCase(),
    );
    if (preset) {
      patch.bgPreset = preset.value;
      patch.bgColor = preset.bg;
      patch.textColor = preset.text;
      patch.customColors = false;
    } else if (fg) {
      patch.bgPreset = '__custom__';
      patch.bgColor = bg;
      patch.textColor = fg;
      patch.customColors = true;
    }
  }

  return patch as Partial<WorReaderSettings>;
};

/** Type-checked legacy TTS prefs (kept for the native TTS bar). */
export const getLegacyTtsPrefs = (): { rate: number; pitch: number } => {
  const legacy =
    getMMKVObject<typeof initialChapterReaderSettings>(CHAPTER_READER_SETTINGS);
  const rate = asNumber(legacy?.tts?.rate, 0.5, 2, 1);
  const pitch = asNumber(legacy?.tts?.pitch, 0.5, 2, 1);
  return {
    rate: Number.isFinite(rate) ? rate : 1,
    pitch: Number.isFinite(pitch) ? pitch : 1,
  };
};

// ---------------------------------------------------------- orchestration ---
/**
 * Runs the migration once per install (flag key in MMKV). Never throws.
 * Returns true when a migration actually wrote a patch.
 */
export const migrateLegacyReaderSettingsOnce = (): boolean => {
  try {
    if (MMKVStorage.getString(WOR_MIGRATION_FLAG) === 'done') {
      return false;
    }
    const legacy = getMMKVObject<LegacyReaderSettingsLike>(
      CHAPTER_READER_SETTINGS,
    );
    const patch = mapLegacyToWorSettings(legacy);
    let migrated = false;
    if (Object.keys(patch).length > 0) {
      // Overlay on top of the CURRENT wor settings (not the defaults) so a
      // re-install keeps whatever the engine already stored.
      const current = loadWorSettings();
      saveWorSettingsPatch({ ...(current as object), ...patch } as Record<
        string,
        unknown
      >);
      migrated = true;
    }
    MMKVStorage.set(WOR_MIGRATION_FLAG, 'done');
    return migrated;
  } catch {
    // best-effort — never block the settings screen
    return false;
  }
};
