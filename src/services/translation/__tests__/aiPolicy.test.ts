// aiPolicy — the v3 whole-chapter batching plan for the 'ai' engine.
// Verifies the spec numbers: 1,000/2,500-word chapters = ONE request,
// 4,000 words = two, oversized chapters exceed the ceiling and require
// approval. Segments are never split (parts break BETWEEN segments only).

import {
  AI_OUTPUT_TOKEN_BUDGET,
  clampMaxRequests,
  estimateTokens,
  planAIParts,
} from '../aiPolicy';

const makeSegments = (count: number, chars: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `s${index}`,
    text: 'x'.repeat(chars) + String(index),
  }));

describe('estimateTokens', () => {
  it('is ceil(codePoints / 3.4)', () => {
    expect(estimateTokens('x'.repeat(34))).toBe(10);
    expect(estimateTokens('x'.repeat(35))).toBe(11);
    // surrogate pairs count as ONE code point each
    expect(estimateTokens('😀'.repeat(34))).toBe(10);
  });
});

describe('clampMaxRequests', () => {
  it('clamps to 1..12 with a sane default', () => {
    expect(clampMaxRequests(0)).toBe(3);
    expect(clampMaxRequests(-5)).toBe(3);
    expect(clampMaxRequests(1)).toBe(1);
    expect(clampMaxRequests(99)).toBe(12);
    expect(clampMaxRequests(2.6)).toBe(3);
  });
});

describe('planAIParts', () => {
  it('plans ONE whole-chapter request for ~1,000 words', () => {
    // 1,000 words ≈ 6,000 chars ≈ 1,765 tokens → well under the budget.
    const segments = makeSegments(200, 30); // 6,000 chars
    const plan = planAIParts(segments);
    expect(plan.requests).toBe(1);
    expect(plan.parts).toEqual([[0, 200]]);
    expect(plan.exceedsCeiling).toBe(false);
  });

  it('plans ONE request for ~2,500 words', () => {
    const segments = makeSegments(350, 43); // ~15,000 chars
    const plan = planAIParts(segments);
    expect(plan.requests).toBe(1);
  });

  it('splits a ~4,000-word chapter into two large parts', () => {
    // 24,000 chars ≈ 7,059 tokens → 2 natural parts.
    const segments = makeSegments(400, 60);
    const plan = planAIParts(segments);
    expect(plan.requests).toBe(2);
    expect(plan.exceedsCeiling).toBe(false);
    // Parts cover the whole chapter exactly once, in order, never splitting
    // a segment.
    expect(plan.parts[0][0]).toBe(0);
    expect(plan.parts[1][1]).toBe(400);
    expect(plan.parts[0][1]).toBe(plan.parts[1][0]);
  });

  it('never splits inside a segment and covers every segment once', () => {
    const segments = makeSegments(733, 200); // 146k chars ≈ 43k tokens → 8 parts
    const plan = planAIParts(segments, { maxRequestsPerChapter: 12 });
    const covered = plan.parts.reduce((sum, [from, to]) => sum + (to - from), 0);
    expect(covered).toBe(segments.length);
    for (let i = 1; i < plan.parts.length; i += 1) {
      expect(plan.parts[i][0]).toBe(plan.parts[i - 1][1]);
    }
  });

  it('flags exceeding the ceiling and keeps budget-sized parts', () => {
    // ~43k tokens at a 6k budget → 8 natural parts > ceiling 3.
    const segments = makeSegments(733, 200);
    const plan = planAIParts(segments, { maxRequestsPerChapter: 3 });
    expect(plan.requests).toBeGreaterThan(3);
    expect(plan.exceedsCeiling).toBe(true);
    expect(plan.reason).toContain('طلب');
    // No part may exceed the default output budget by much: parts stay
    // budget-sized (approval buys MORE requests, not oversized outputs).
    for (const [from, to] of plan.parts) {
      const slice = segments.slice(from, to);
      const tokens = slice.reduce((sum, row) => sum + estimateTokens(row.text), 0);
      expect(tokens).toBeLessThanOrEqual(AI_OUTPUT_TOKEN_BUDGET + estimateTokens('x'.repeat(200)));
    }
  });

  it('respects the hard char ceiling for dense scripts', () => {
    // Dense CJK text: 40k chars at ~1.5 chars/token ≈ 27k tokens → many
    // parts, but every part stays under AI_MAX_PART_CHARS (40,000).
    const segments = makeSegments(2000, 30); // 60k chars
    const plan = planAIParts(segments, { maxRequestsPerChapter: 12 });
    for (const [from, to] of plan.parts) {
      const chars = segments
        .slice(from, to)
        .reduce((sum, row) => sum + Array.from(row.text).length, 0);
      expect(chars).toBeLessThanOrEqual(40_000);
    }
  });

  it('returns an empty plan for no segments', () => {
    expect(planAIParts([])).toEqual({ parts: [], requests: 0, exceedsCeiling: false });
  });
});
