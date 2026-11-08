// src/services/translation/__tests__/sha256.test.ts
// Known-answer tests for the SHA-256 port (translation memory keys must be
// deterministic across restarts — they ARE the persisted row keys).

import { sha256Hex } from '../sha256';

describe('sha256Hex', () => {
  it('matches known FIPS 180-4 vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(
      sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('deterministic across restarts — the persisted row key contract', () => {
    expect(sha256Hex('قمر القراءة')).toBe(sha256Hex('قمر القراءة'));
    expect(sha256Hex('قمر')).not.toBe(sha256Hex('قمر '));
  });

  it('handles long inputs without crashing', () => {
    const long = 'a'.repeat(100_000);
    expect(sha256Hex(long)).toHaveLength(64);
  });
});
