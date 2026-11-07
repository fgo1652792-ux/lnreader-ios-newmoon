// lnreader-ios/src/services/reader/migrateClassicReaderSettings.ts
//
// One-time typed migration of the CLASSIC reader settings
// (MMKV `CHAPTER_READER_SETTINGS`) onto the New-moon engine settings
// (`@wor_reader_settings_v4`). New Moon is the only visible reader engine, so
// whatever the user tuned on the classic reader must not be silently dropped.
//
// Rules (strict per-key validation — a corrupt legacy blob can never produce
// an invalid WOR settings object):
//   • numbers: `typeof number && Number.isFinite`, then clamped to the SAME
//     ranges the engine's own dock sliders allow (worShell.js range inputs).
//   • colors: /^#([0-9a-fA-F]{3,8})$/ only.
//   • enums: whitelisted against the values the shell's UI actually offers.
//   • fontValue: only mapped when the legacy value exists in worFonts' list —
//     the classic Latin fonts (lora, lato, …) have no bundled WOR equivalent
//     and are skipped, keeping the engine default.
//   • legacy `replaceText` (Record<string,string>) is DELIBERATELY NOT
//     migrated: replacement words belong to the words store
//     (src/reader/newmoon/wordsStore.js), not to reader settings — auto-
//     migrating them here would silently create global word entries.
//
// The migration runs at most once per install (MMKV flag
// `@wor_settings_migrated_v1`, see ensureClassicMigration) and never clobbers
// WOR settings that were already customized.

import { MMKVStorage } from '@utils/mmkv/mmkv';
import { CHAPTER_READER_SETTINGS } from '@hooks/persisted/useSettings';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  THEME_CYCLE,
} from '../../reader/newmoon/sections';
import { WOR_FONTS } from '../../reader/newmoon/worFonts';
import {
  WOR_SETTINGS_KEY,
  saveWorSettingsPatch,
  type WorReaderSettings,
} from '../../screens/reader/newmoon/NewMoonAdapter';

export const WOR_SETTINGS_MIGRATION_FLAG = '@wor_settings_migrated_v1';

/**
 * Engine-validated ranges — mirrors the worShell.js dock sliders
 * (worRangeFontSize min="14" max="34", worRangeLineHeight 1.5–3,
 * worRangeWordSpacing -2–10, worRangeBrightness 0.4–1.5 and the four
 * size-percentage sliders 80–150).
 */
export const WOR_LIMITS = {
  fontSize: { min: 14, max: 34 },
  lineHeight: { min: 1.5, max: 3 },
  wordSpacing: { min: -2, max: 10 },
  brightness: { min: 0.4, max: 1.5 },
  formatSizePct: { min: 80, max: 150 },
} as const;

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3,8})$/;

/** Classic textAlign → wor `direction`. 'auto'/'justify' have no equivalent. */
const TEXT_ALIGN_TO_DIRECTION: Record<string, WorReaderSettings['direction']> =
  {
    left: 'ltr',
    right: 'rtl',
    center: 'center',
  };

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR_RE.test(value);

/** Strict number: finite JS numbers only, clamped into the engine range. */
const toClampedNumber = (
  value: unknown,
  min: number,
  max: number,
): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(max, Math.max(min, value));
};

const toEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null => (allowed.includes(value as T) ? (value as T) : null);

const isKnownWorFont = (value: unknown): value is string =>
  typeof value === 'string' && WOR_FONTS.some(font => font.value === value);

/** Case-insensitive match of a bgColor against the shell's theme cycle. */
const matchThemeCyclePreset = (
  bgColor: string,
): WorReaderSettings['bgPreset'] | null => {
  const preset = THEME_CYCLE.find(
    t => t.bgColor.toLowerCase() === bgColor.toLowerCase(),
  );
  return preset ? preset.bgPreset : null;
};

/**
 * Overlays validated classic settings onto `base`. Unknown/corrupt values are
 * skipped (never written), so `settings` stays type-valid. `applied` lists the
 * LEGACY keys that contributed a value.
 */
export const migrateClassicToWor = (
  old: unknown,
  base: WorReaderSettings,
): { settings: WorReaderSettings; applied: string[] } => {
  const settings: WorReaderSettings = { ...base };
  const applied: string[] = [];

  if (!old || typeof old !== 'object' || Array.isArray(old)) {
    return { settings, applied };
  }
  const legacy = old as Record<string, unknown>;

  // textSize → fontSize
  const fontSize = toClampedNumber(
    legacy.textSize,
    WOR_LIMITS.fontSize.min,
    WOR_LIMITS.fontSize.max,
  );
  if (fontSize !== null) {
    settings.fontSize = fontSize;
    applied.push('textSize');
  }

  // lineHeight → lineHeight
  const lineHeight = toClampedNumber(
    legacy.lineHeight,
    WOR_LIMITS.lineHeight.min,
    WOR_LIMITS.lineHeight.max,
  );
  if (lineHeight !== null) {
    settings.lineHeight = lineHeight;
    applied.push('lineHeight');
  }

  // theme → bgColor (+ bgPreset/customColors from the theme cycle)
  if (isHexColor(legacy.theme)) {
    settings.bgColor = legacy.theme;
    const preset = matchThemeCyclePreset(legacy.theme);
    if (preset) {
      settings.bgPreset = preset;
      settings.customColors = false;
    } else {
      settings.customColors = true;
    }
    applied.push('theme');
  }

  // textColor → textColor
  if (isHexColor(legacy.textColor)) {
    settings.textColor = legacy.textColor;
    applied.push('textColor');
  }

  // textAlign → direction (whitelisted values only)
  const direction = toEnum(
    typeof legacy.textAlign === 'string'
      ? TEXT_ALIGN_TO_DIRECTION[legacy.textAlign]
      : undefined,
    ['rtl', 'ltr', 'center'] as const,
  );
  if (direction) {
    settings.direction = direction;
    applied.push('textAlign');
  }

  // fontFamily → fontValue (only when the value exists in the WOR font list)
  if (isKnownWorFont(legacy.fontFamily)) {
    settings.fontValue = legacy.fontFamily;
    applied.push('fontFamily');
  }

  // NOT migrated on purpose:
  //   • replaceText/removeText → words store domain (see header comment)
  //   • customCSS/customJS/codeSnippets* → classic-engine-only concepts
  //   • tts.{rate,pitch,voice} → the wor engine only exposes ttsEnabled
  //   • padding → the wor engine has no padding key (verified in sections.ts)

  return { settings, applied };
};

const safeParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/**
 * True when the stored WOR payload carries no user customization: the key is
 * absent, the payload is corrupt (loadWorSettings falls back to defaults), or
 * the merged values equal DEFAULT_SETTINGS.
 */
const worSettingsArePristine = (worRaw: string | undefined): boolean => {
  if (!worRaw) {
    return true;
  }
  const saved = safeParse(worRaw);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return true; // corrupt → engine falls back to defaults
  }
  const savedPatch = saved as Record<string, unknown>;
  const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
  return SETTINGS_KEYS.every(key => {
    const stored = savedPatch[key];
    return stored === undefined || stored === defaults[key];
  });
};

/**
 * One-time classic→wor migration guard. Called from loadWorSettings() BEFORE
 * it reads the key (and can also be triggered from the settings screen).
 *
 * MUST NOT call loadWorSettings()/any Adapter reader of the WOR key — it runs
 * from inside loadWorSettings() and would recurse. It reads the raw MMKV
 * payload and migrates onto DEFAULT_SETTINGS directly.
 */
export const ensureClassicMigration = (): void => {
  try {
    if (MMKVStorage.getString(WOR_SETTINGS_MIGRATION_FLAG) === 'true') {
      return;
    }

    const classicRaw = MMKVStorage.getString(CHAPTER_READER_SETTINGS);
    if (
      classicRaw &&
      worSettingsArePristine(MMKVStorage.getString(WOR_SETTINGS_KEY))
    ) {
      const { settings, applied } = migrateClassicToWor(
        safeParse(classicRaw),
        { ...DEFAULT_SETTINGS },
      );
      if (applied.length > 0) {
        // Full-object patch: the persisted value is complete and type-valid.
        saveWorSettingsPatch(settings);
      }
    }

    // Set even when nothing was applied or the clobber-guard skipped the
    // merge: the check itself is one-shot, matching the flag contract.
    MMKVStorage.set(WOR_SETTINGS_MIGRATION_FLAG, 'true');
  } catch {
    // Migration is best-effort — it must never break settings loading.
  }
};
