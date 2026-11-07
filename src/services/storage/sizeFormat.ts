/**
 * Human-readable byte formatting for the Data & Storage screen.
 *
 * Kept deliberately plain ("12.4 MB", ASCII digits, "." separator) so the UI
 * can mirror/position it safely in RTL locales without localized numerals
 * breaking the layout.
 */

const UNIT_STEP = 1024;
const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return `0 ${UNITS[0]}`;
  }

  let value = bytes;
  let unitIndex = 0;
  while (value >= UNIT_STEP && unitIndex < UNITS.length - 1) {
    value /= UNIT_STEP;
    unitIndex++;
  }

  if (unitIndex === 0) {
    return `${Math.round(value)} ${UNITS[unitIndex]}`;
  }
  return `${value.toFixed(1)} ${UNITS[unitIndex]}`;
};
