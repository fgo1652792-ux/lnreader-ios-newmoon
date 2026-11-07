import { formatBytes } from '../sizeFormat';

describe('formatBytes', () => {
  it('formats zero and invalid values as 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
  });

  it('formats bytes without decimals', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats kilobytes with one decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024)).toBe('10.0 KB');
  });

  it('formats megabytes with one decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12.4 MB');
  });

  it('formats gigabytes with one decimal', () => {
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5.0 GB');
  });

  it('caps at GB instead of inventing larger units', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024 * 1024)).toBe('2048.0 GB');
  });

  it('uses a plain ASCII decimal point (Arabic-friendly, RTL safe)', () => {
    expect(formatBytes(230 * 1024 * 1024)).toMatch(/^230\.0 MB$/);
  });

  it('rounds sub-decimal remainders to one digit', () => {
    expect(formatBytes(1024 + 51)).toBe('1.0 KB');
    expect(formatBytes(1024 + 102)).toBe('1.1 KB');
  });
});
