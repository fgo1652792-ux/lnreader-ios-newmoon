/**
 * Pure, dependency-free color helpers for Theme Studio.
 *
 * The MD3 theme files store colors either as hex (`#AABBCC`) or as CSS-ish
 * `rgb()`/`rgba()` strings, so every helper here accepts both and returns
 * `null` for anything it cannot parse (names, garbage, non-strings).
 *
 * Nothing in this file imports React / React Native / MMKV so it is trivially
 * unit-testable and safe to use inside `useMemo` hot paths.
 */

export type Rgba = {
  /** 0–255 */
  r: number;
  /** 0–255 */
  g: number;
  /** 0–255 */
  b: number;
  /** 0–1 */
  a: number;
};

export type Hsv = {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
};

const HEX_PATTERN =
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const RGB_FN_PATTERN = /^rgba?\(\s*([^)]+)\)$/i;

const clampChannel = (value: number): number =>
  Math.round(Math.min(255, Math.max(0, value)));

const clampAlpha = (value: number): number => Math.min(1, Math.max(0, value));

const byteToHex = (value: number): string =>
  clampChannel(value).toString(16).padStart(2, '0');

const expandShortHex = (digits: string): string =>
  digits
    .slice(0, 3)
    .split('')
    .map(c => c + c)
    .join('');

/**
 * Parses any supported color notation into RGBA components.
 * Supported: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`, `rgb(r, g, b)`,
 * `rgba(r, g, b, a)`. Named colors (`red`, `white`, …) and anything else
 * return `null` — callers must fall back to the underlying MD3 token.
 */
export const parseColor = (value: unknown): Rgba | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('#')) {
    if (!HEX_PATTERN.test(trimmed)) {
      return null;
    }
    const digits = trimmed.slice(1);
    if (digits.length === 3 || digits.length === 4) {
      const rgb = expandShortHex(digits);
      return {
        r: parseInt(rgb.slice(0, 2), 16),
        g: parseInt(rgb.slice(2, 4), 16),
        b: parseInt(rgb.slice(4, 6), 16),
        a: 1,
      };
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }

  const fnMatch = RGB_FN_PATTERN.exec(trimmed);
  if (!fnMatch) {
    return null;
  }
  const parts = fnMatch[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) {
    return null;
  }
  const numbers: number[] = [];
  for (const part of parts) {
    const parsed = part.endsWith('%')
      ? (parseFloat(part) / 100) * 255
      : parseFloat(part);
    if (Number.isNaN(parsed)) {
      return null;
    }
    numbers.push(parsed);
  }
  return {
    r: clampChannel(numbers[0]),
    g: clampChannel(numbers[1]),
    b: clampChannel(numbers[2]),
    a: numbers.length === 4 ? clampAlpha(numbers[3]) : 1,
  };
};

/** Alpha-composites `fg` over `bg` (both opaque-safe RGBA). */
export const compositeOver = (fg: Rgba, bg: Rgba): Rgba => {
  if (fg.a >= 1) {
    return fg;
  }
  const alpha = clampAlpha(fg.a);
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    a: 1,
  };
};

/**
 * Normalizes any supported color to an opaque `#rrggbb` string.
 * Alpha is truncated (matching the app's reader `colorUtils` convention) so
 * translucent tokens like `surfaceDisabled`/`backdrop` keep their base hue
 * without baking in a background. Returns `null` for unparseable input —
 * never throws, so corrupt stored values can simply fall through to the MD3
 * base.
 */
export const normalizeHex = (value: unknown): string | null => {
  const parsed = parseColor(value);
  if (!parsed) {
    return null;
  }
  return `#${byteToHex(parsed.r)}${byteToHex(parsed.g)}${byteToHex(parsed.b)}`;
};

/** `Rgba` → `#rrggbb` (alpha dropped). */
export const rgbaToHex = ({ r, g, b }: Rgba): string =>
  `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;

/** `#rrggbb`-style hex → `Rgba` with alpha 1. Invalid input → `null`. */
export const hexToRgba = (value: string): Rgba | null => {
  const normalized = normalizeHex(value);
  if (!normalized) {
    return null;
  }
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
    a: 1,
  };
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** RGB (0–255) → HSV with `h` 0–360 and `s`/`v` 0–1. */
export const rgbToHsv = ({ r, g, b }: Omit<Rgba, 'a'>): Hsv => {
  const rn = clamp01(r / 255);
  const gn = clamp01(g / 255);
  const bn = clamp01(b / 255);
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) {
      h += 360;
    }
  }

  return { h, s: max === 0 ? 0 : delta / max, v: max };
};

/** HSV → RGB (0–255). Inputs are clamped, so out-of-range values never throw. */
export const hsvToRgb = ({ h, s, v }: Hsv): Rgba => {
  const hue = (((h % 360) + 360) % 360) / 60;
  const sat = clamp01(s);
  const val = clamp01(v);

  const c = val * sat;
  const x = c * (1 - Math.abs((hue % 2) - 1));
  const m = val - c;

  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hue < 1) {
    rn = c;
    gn = x;
  } else if (hue < 2) {
    rn = x;
    gn = c;
  } else if (hue < 3) {
    gn = c;
    bn = x;
  } else if (hue < 4) {
    gn = x;
    bn = c;
  } else if (hue < 5) {
    rn = x;
    bn = c;
  } else {
    rn = c;
    bn = x;
  }

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
    a: 1,
  };
};

/** Any supported color string → HSV. Invalid input → `null`. */
export const hexToHsv = (value: string): Hsv | null => {
  const rgba = hexToRgba(value);
  if (!rgba) {
    return null;
  }
  return rgbToHsv(rgba);
};

/** HSV → `#rrggbb`. */
export const hsvToHex = (hsv: Hsv): string => rgbaToHex(hsvToRgb(hsv));

/** WCAG 2.x relative luminance from 0–255 channels. */
export const relativeLuminance = ({ r, g, b }: Omit<Rgba, 'a'>): number => {
  const channel = (raw: number): number => {
    const c = clamp01(raw / 255);
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/**
 * WCAG contrast ratio between two colors (1–21). Alpha in the foreground is
 * composited over the background first. Unparseable inputs yield `1` (no
 * contrast) so the UI shows a warning instead of crashing.
 */
export const contrastRatio = (
  foreground: string,
  background: string,
): number => {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) {
    return 1;
  }
  const opaqueFg = compositeOver(fg, bg);
  const l1 = relativeLuminance(opaqueFg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

/** Formats a raw ratio for display, e.g. `4.54:1`. */
export const formatContrast = (ratio: number): string =>
  `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
