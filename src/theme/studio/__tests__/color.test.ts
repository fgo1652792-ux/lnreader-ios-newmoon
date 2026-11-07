import {
  compositeOver,
  contrastRatio,
  formatContrast,
  hexToHsv,
  hexToRgba,
  hsvToHex,
  hsvToRgb,
  normalizeHex,
  parseColor,
  rgbToHsv,
} from '../color';

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#0057CE')).toEqual({ r: 0, g: 87, b: 206, a: 1 });
  });

  it('parses 3-digit hex expanded', () => {
    expect(parseColor('#F53')).toEqual({ r: 255, g: 85, b: 51, a: 1 });
  });

  it('parses 8-digit hex with alpha', () => {
    expect(parseColor('#00000080')).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 128 / 255,
    });
  });

  it('parses rgb() and rgba() strings (the MD3 theme format)', () => {
    expect(parseColor('rgb(0, 87, 206)')).toEqual({
      r: 0,
      g: 87,
      b: 206,
      a: 1,
    });
    expect(parseColor('rgba(34, 34, 34, 0.12)')).toEqual({
      r: 34,
      g: 34,
      b: 34,
      a: 0.12,
    });
  });

  it('rejects named colors and garbage', () => {
    expect(parseColor('red')).toBeNull();
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor('   ')).toBeNull();
    expect(parseColor('#12345')).toBeNull();
    expect(parseColor('#GGHHII')).toBeNull();
    expect(parseColor('rgb(1, 2)')).toBeNull();
    expect(parseColor('rgb(a, b, c)')).toBeNull();
    expect(parseColor('hsl(10, 50%, 50%)')).toBeNull();
    expect(parseColor(123)).toBeNull();
    expect(parseColor(null)).toBeNull();
    expect(parseColor(undefined)).toBeNull();
    expect(parseColor({ r: 1, g: 2, b: 3 })).toBeNull();
  });

  it('clamps out-of-range rgb() components', () => {
    expect(parseColor('rgb(300, -20, 128.4)')).toEqual({
      r: 255,
      g: 0,
      b: 128,
      a: 1,
    });
  });
});

describe('normalizeHex', () => {
  it('normalizes upper-case hex to lower-case #rrggbb', () => {
    expect(normalizeHex('#FF00AA')).toBe('#ff00aa');
  });

  it('expands 3-digit hex', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('#FFF')).toBe('#ffffff');
  });

  it('expands 4-digit hex and drops alpha', () => {
    expect(normalizeHex('#abcd')).toBe('#aabbcc');
  });

  it('truncates 8-digit hex', () => {
    expect(normalizeHex('#11223344')).toBe('#112233');
  });

  it('converts rgb()/rgba() strings (alpha truncated)', () => {
    expect(normalizeHex('rgb(0, 87, 206)')).toBe('#0057ce');
    expect(normalizeHex('rgba(34, 34, 34, 0.12)')).toBe('#222222');
  });

  it('returns null for garbage, names and wrong types (never throws)', () => {
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex('not-a-color')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex(42)).toBeNull();
    expect(normalizeHex(null)).toBeNull();
    expect(normalizeHex(undefined)).toBeNull();
  });
});

describe('HSV <-> RGB <-> hex conversions', () => {
  it('maps primary hues correctly', () => {
    expect(hsvToRgb({ h: 0, s: 1, v: 1 })).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 1,
    });
    expect(hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual({
      r: 0,
      g: 255,
      b: 0,
      a: 1,
    });
    expect(hsvToRgb({ h: 240, s: 1, v: 1 })).toEqual({
      r: 0,
      g: 0,
      b: 255,
      a: 1,
    });
    expect(hsvToRgb({ h: 0, s: 0, v: 0.5 })).toEqual({
      r: 128,
      g: 128,
      b: 128,
      a: 1,
    });
  });

  it('inverts: rgbToHsv of primary colors', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 1, v: 1 });
    expect(rgbToHsv({ r: 128, g: 128, b: 128 })).toEqual({
      h: 0,
      s: 0,
      v: 0.5019607843137255,
    });
  });

  it('clamps out-of-range HSV inputs instead of throwing', () => {
    expect(hsvToRgb({ h: 400, s: 2, v: -1 })).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 1,
    });
    expect(hsvToRgb({ h: -60, s: 1, v: 1 })).toEqual({
      r: 255,
      g: 0,
      b: 255,
      a: 1,
    });
  });

  it('round-trips every color on a byte grid exactly (rgb -> hsv -> rgb)', () => {
    const steps = [0, 51, 102, 153, 204, 255];
    for (const r of steps) {
      for (const g of steps) {
        for (const b of steps) {
          const hsv = rgbToHsv({ r, g, b });
          const back = hsvToRgb(hsv);
          expect({ r: back.r, g: back.g, b: back.b }).toEqual({ r, g, b });
        }
      }
    }
  });

  it('round-trips hsv -> hex -> hsv within one byte of quantization', () => {
    for (let h = 0; h < 360; h += 15) {
      for (const s of [0, 0.25, 0.5, 0.75, 1]) {
        for (const v of [0.1, 0.35, 0.6, 0.85, 1]) {
          const rgb = hsvToRgb({ h, s, v });
          const back = hexToHsv(hsvToHex({ h, s, v }));
          expect(back).not.toBeNull();
          const rgbBack = hsvToRgb(back as { h: number; s: number; v: number });
          expect(Math.abs(rgbBack.r - rgb.r)).toBeLessThanOrEqual(1);
          expect(Math.abs(rgbBack.g - rgb.g)).toBeLessThanOrEqual(1);
          expect(Math.abs(rgbBack.b - rgb.b)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('hexToHsv / hexToRgba return null for invalid input', () => {
    expect(hexToHsv('nope')).toBeNull();
    expect(hexToRgba('#12345')).toBeNull();
  });

  it('hsvToHex produces stable lower-case hex', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: 0, s: 0, v: 1 })).toBe('#ffffff');
    expect(hsvToHex({ h: 0, s: 0, v: 0 })).toBe('#000000');
  });
});

describe('compositeOver', () => {
  it('keeps opaque foregrounds untouched', () => {
    const fg = { r: 10, g: 20, b: 30, a: 1 };
    expect(compositeOver(fg, { r: 255, g: 255, b: 255, a: 1 })).toEqual(fg);
  });

  it('blends translucent foregrounds', () => {
    const result = compositeOver(
      { r: 0, g: 0, b: 0, a: 0.5 },
      { r: 255, g: 255, b: 255, a: 1 },
    );
    expect(result.r).toBeCloseTo(127.5);
    expect(result.a).toBe(1);
  });
});

describe('contrastRatio (WCAG)', () => {
  it('gives 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('gives 1:1 for identical colors', () => {
    expect(contrastRatio('#808080', '#808080')).toBe(1);
    expect(contrastRatio('rgb(128,128,128)', '#808080')).toBe(1);
  });

  it('classifies the standard AA boundary greys', () => {
    // #767676 on white ≈ 4.54 — passes normal-text AA
    const pass = contrastRatio('#767676', '#ffffff');
    expect(pass).toBeGreaterThanOrEqual(4.5);
    expect(pass).toBeLessThan(4.6);
    // #808080 on white ≈ 3.95 — fails normal text, passes icon/large AA
    const fail = contrastRatio('#808080', '#ffffff');
    expect(fail).toBeLessThan(4.5);
    expect(fail).toBeGreaterThanOrEqual(3);
  });

  it('handles rgb() strings and rgba foregrounds', () => {
    expect(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBeCloseTo(
      21,
      5,
    );
    // rgba(0,0,0,0.5) over white ≈ #808080 → ≈ 3.98
    expect(contrastRatio('rgba(0,0,0,0.5)', '#ffffff')).toBeCloseTo(3.98, 1);
  });

  it('never throws on invalid input and yields "no contrast" (1)', () => {
    expect(contrastRatio('garbage', '#ffffff')).toBe(1);
    expect(contrastRatio('#ffffff', 'garbage')).toBe(1);
    expect(contrastRatio('garbage', 'garbage')).toBe(1);
  });
});

describe('formatContrast', () => {
  it('formats ratios with two decimals and :1 suffix', () => {
    expect(formatContrast(21)).toBe('21.00:1');
    expect(formatContrast(4.541)).toBe('4.54:1');
    expect(formatContrast(3)).toBe('3.00:1');
  });
});
