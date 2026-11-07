import { contrastRatio, normalizeHex } from '../color';
import { THEME_PRESETS } from '../presets';
import { CONTRAST_PAIRS, type TokenOverrides } from '../tokens';

describe('THEME_PRESETS', () => {
  it('ships 5 presets with stable ids', () => {
    expect(THEME_PRESETS).toHaveLength(5);
    const ids = THEME_PRESETS.map(preset => preset.id);
    expect(new Set(ids).size).toBe(THEME_PRESETS.length);
    for (const id of ids) {
      expect(id).toMatch(/^preset:/);
    }
    expect(ids).toEqual([
      'preset:default',
      'preset:sepia',
      'preset:midnight',
      'preset:rose',
      'preset:forest',
    ]);
  });

  it('only contains valid hex values (never crashes the theme pipeline)', () => {
    for (const preset of THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const overrides: TokenOverrides | undefined = preset[mode];
        for (const [token, value] of Object.entries(overrides ?? {})) {
          const normalized = normalizeHex(value);
          expect(`invalid ${token} in ${preset.id}/${mode}: ${value}`).toBe(
            `invalid ${token} in ${preset.id}/${mode}: ${value}`,
          );
          expect(normalized).not.toBeNull();
          expect(normalized).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it('default preset overrides nothing (falls through to the MD3 scheme)', () => {
    const fallback = THEME_PRESETS[0];
    expect(fallback.light).toEqual({});
    expect(fallback.dark).toEqual({});
  });

  it('overrides both modes for the tuned presets', () => {
    for (const preset of THEME_PRESETS.slice(1)) {
      expect(Object.keys(preset.light ?? {}).length).toBeGreaterThan(8);
      expect(Object.keys(preset.dark ?? {}).length).toBeGreaterThan(8);
    }
  });

  /**
   * WCAG AA guard: every contrast pair where BOTH tokens are overridden by
   * the preset must meet its minimum (4.5:1 normal text, 3:1 icons/large).
   * Pairs with non-overridden tokens keep falling through to the MD3 base
   * scheme, which is validated separately by the app's own palette.
   */
  it('passes WCAG AA for all fully-overridden contrast pairs', () => {
    const problems: string[] = [];
    for (const preset of THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const overrides = (preset[mode] ?? {}) as TokenOverrides;
        for (const pair of CONTRAST_PAIRS) {
          const fg = overrides[pair.fg];
          const bg = overrides[pair.bg];
          if (!fg || !bg) {
            continue;
          }
          const ratio = contrastRatio(fg as string, bg as string);
          if (ratio < pair.min) {
            problems.push(
              `${preset.id}/${mode}: ${pair.fg} on ${pair.bg} = ${ratio.toFixed(
                2,
              )} < ${pair.min}`,
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
