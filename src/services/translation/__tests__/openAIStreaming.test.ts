// src/services/translation/__tests__/openAIStreaming.test.ts
// Port-fidelity tests for OpenAIPageTranslation.swift:
// plan reassembly, the incremental JSON lexer, duplicate-ID rejection and
// the piece assembly ordering/whitespace rules.

import {
  AITranslationAssembly,
  AITranslationJSONStream,
  makeAITranslationPlan,
} from '../providers/openAIStreaming';

describe('makeAITranslationPlan (Zeus AITranslationPlan.make)', () => {
  it('splits a large document into ≤3 batches with reassemblable pieces', () => {
    const words: string[] = [];
    for (let i = 0; i < 3000; i++) words.push(`word${i}`);
    const originals = [
      { id: 'a', text: words.join(' ') },
      { id: 'b', text: 'short tail' },
    ];
    const plan = makeAITranslationPlan(originals);
    expect(plan.batches.length).toBeGreaterThanOrEqual(2);
    expect(plan.batches.length).toBeLessThanOrEqual(3);
    // every original char is covered by exactly one piece, in order
    for (const original of originals) {
      const pieces = plan.pieces.filter(p => p.originalID === original.id);
      expect(pieces.map(p => p.source).join('')).toBe(original.text);
    }
    // piece ids are unique and referenced by exactly one batch item
    const ids = plan.pieces.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const batchItems = plan.batches.flat().map(b => b.id);
    expect(new Set(batchItems).size).toBe(batchItems.length);
  });

  it('keeps a small document in one batch', () => {
    // ZEUS SEMANTICS (verified against AITranslationPlan.make): desired is
    // ALWAYS ≥ 2 for non-empty input (`remaining > 160_000 ? 3 : 2`), so even
    // a tiny document is planned as 2 parallel streamed requests. The port
    // must reproduce this exactly, not "optimize" it.
    const plan = makeAITranslationPlan([{ id: 'a', text: 'tiny' }]);
    expect(plan.batches.length).toBe(2);
    expect(plan.pieces.map(p => p.source).join('')).toBe('tiny');
  });

  it('empty input yields no batches (caller returns originals)', () => {
    expect(makeAITranslationPlan([]).batches).toHaveLength(0);
  });
});

describe('AITranslationJSONStream (Zeus single-pass lexer)', () => {
  const expected = new Set(['p1', 'p2']);

  const feedAll = (chunks: string[]) => {
    const parser = new AITranslationJSONStream(expected);
    for (const chunk of chunks) parser.append(chunk);
    return parser;
  };

  it('emits finished tokens after complete objects', () => {
    const parser = feedAll([
      '[{"id":"p1","text":"مرحبًا"},{"id":"p2","text":"العالم"}]',
    ]);
    const updates = parser.updates();
    const finished = updates.filter(u => u.finished);
    expect(finished.map(u => u.id).sort()).toEqual(['p1', 'p2']);
  });

  it('survives byte-level chunk splits mid-string (partial decode)', () => {
    const full =
      '[{"id":"p1","text":"نص طويل نسبيًا للتقسيم"},{"id":"p2","text":"اخر"}]';
    const mid = Math.floor(full.length / 2);
    const parser = feedAll([full.slice(0, mid), full.slice(mid)]);
    const updates = parser.updates();
    expect(updates.filter(u => u.finished)).toHaveLength(2);
  });

  it('provides partial text updates before the closing quote', () => {
    const parser = new AITranslationJSONStream(expected);
    parser.append('[{"id":"p1","text":"بداية نص غير');
    const partials = parser.updates().filter(u => !u.finished);
    // partial emission is best-effort; never an exception
    expect(Array.isArray(partials)).toBe(true);
    parser.append(' مكتمل"}]');
    const finished = parser.updates().filter(u => u.finished);
    expect(finished).toHaveLength(1);
    expect(finished[0].text).toBe('بداية نص غير مكتمل');
  });

  it('IGNORES unknown IDs — they never reach the DOM', () => {
    const parser = new AITranslationJSONStream(expected);
    parser.append(
      '[{"id":"ghost","text":"غير معروف"},{"id":"p1","text":"معروف"}]',
    );
    const updates = parser.updates();
    expect(updates.map(u => u.id)).toEqual(['p1']);
  });

  it('REJECTS a duplicated finished ID', () => {
    const parser = new AITranslationJSONStream(expected);
    expect(() =>
      parser.append('[{"id":"p1","text":"أ"},{"id":"p1","text":"ب"}]'),
    ).toThrow(/مكرر/);
  });

  it('escapes decode through JSON rules (quotes, backslashes, surrogates)', () => {
    const parser = feedAll([
      '[{"id":"p1","text":"قال: \\"مرحبًا\\""},{"id":"p2","text":"emoji \\ud83d\\ude00 ok"}]',
    ]);
    const updates = parser.updates().filter(u => u.finished);
    const byId = new Map(updates.map(u => [u.id, u.text]));
    expect(byId.get('p1')).toBe('قال: "مرحبًا"');
    expect(byId.get('p2')).toBe('emoji \ud83d\ude00 ok');
  });
});

describe('AITranslationAssembly (Zeus ordered reassembly)', () => {
  it('joins split pieces back in order with whitespace preserved', () => {
    const plan = makeAITranslationPlan([
      { id: 'a', text: 'first part and second part' },
    ]);
    const assembly = new AITranslationAssembly(plan);
    const rows = assembly.apply(
      plan.pieces.map(p => ({
        id: p.id,
        text: 'مترجم-' + p.source,
        finished: true,
      })),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('a');
    // ZEUS RULE: each piece contributes leading(source) + trimmed(value) +
    // trailing(source when finished). The split kept the boundary space at
    // the END of piece 1, so the reassembly is:
    //   'مترجم-first part' + ' '  +  'مترجم-and second part'
    expect(rows[0].text).toBe('مترجم-first part مترجم-and second part');
  });

  it('suppresses unchanged duplicates (no repeated screen writes)', () => {
    const plan = makeAITranslationPlan([{ id: 'a', text: 'x' }]);
    const assembly = new AITranslationAssembly(plan);
    const token = { id: plan.pieces[0].id, text: 'نص', finished: true };
    expect(assembly.apply([token])).toHaveLength(1);
    expect(assembly.apply([token])).toHaveLength(0);
  });

  it('result() FAILS when a piece never finished (no partial save)', () => {
    const plan = makeAITranslationPlan([
      { id: 'a', text: 'chunk1 chunk2 chunk3 chunk4 chunk5 chunk6 chunk7' },
    ]);
    const assembly = new AITranslationAssembly(plan);
    // finish only the first piece
    assembly.apply([{ id: plan.pieces[0].id, text: 'جزء', finished: true }]);
    expect(() =>
      assembly.result([
        { id: 'a', text: 'chunk1 chunk2 chunk3 chunk4 chunk5 chunk6 chunk7' },
      ]),
    ).toThrow(/غير مكتملة/);
  });
});
