// validateAIResponse — strict model-output validation shared by the AI and
// Cloudflare engines: fence stripping, exact ID set, uniqueness, non-empty
// texts, per-text character cap, and re-emission in the ORIGINAL order.

import { validateAIResponse } from '../validation';
import { TranslationFailure, type TranslationSegment } from '../types';

const originals: TranslationSegment[] = [
  { id: 'p1', text: 'Hello' },
  { id: 'p2', text: 'World' },
  { id: 'p3', text: 'Again' },
];

describe('validateAIResponse', () => {
  it('accepts a valid JSON array and re-emits results in the original order', () => {
    // Deliberately shuffled: p3, p1, p2.
    const response = JSON.stringify([
      { id: 'p3', text: 'ثالث' },
      { id: 'p1', text: 'أول' },
      { id: 'p2', text: 'ثاني' },
    ]);

    expect(validateAIResponse(response, originals)).toEqual([
      { id: 'p1', text: 'أول' },
      { id: 'p2', text: 'ثاني' },
      { id: 'p3', text: 'ثالث' },
    ]);
  });

  it('strips ```json code fences before parsing', () => {
    const payload = JSON.stringify([
      { id: 'p1', text: 'أول' },
      { id: 'p2', text: 'ثاني' },
      { id: 'p3', text: 'ثالث' },
    ]);

    expect(validateAIResponse(`\`\`\`json\n${payload}\n\`\`\``, originals)).toEqual([
      { id: 'p1', text: 'أول' },
      { id: 'p2', text: 'ثاني' },
      { id: 'p3', text: 'ثالث' },
    ]);
    expect(validateAIResponse(`\`\`\`\n${payload}\n\`\`\``, originals)).toHaveLength(3);
  });

  it('rejects a payload missing one of the requested ids', () => {
    // Second row lost its id entirely; String(undefined) cannot match p2.
    const response = JSON.stringify([
      { id: 'p1', text: 'أول' },
      { text: 'بلا معرف' },
      { id: 'p3', text: 'ثالث' },
    ]);

    expect(() => validateAIResponse(response, originals)).toThrow(TranslationFailure);
  });

  it('rejects unknown ids that were never requested', () => {
    const response = JSON.stringify([
      { id: 'p1', text: 'أول' },
      { id: 'p2', text: 'ثاني' },
      { id: 'p9', text: 'غريب' },
    ]);

    expect(() => validateAIResponse(response, originals)).toThrow(TranslationFailure);
  });

  it('rejects duplicate ids even when the row count matches', () => {
    const response = JSON.stringify([
      { id: 'p1', text: 'أول' },
      { id: 'p1', text: 'مكرر' },
      { id: 'p3', text: 'ثالث' },
    ]);

    expect(() => validateAIResponse(response, originals)).toThrow(TranslationFailure);
  });

  it('rejects empty or whitespace-only texts', () => {
    const blank = JSON.stringify([
      { id: 'p1', text: 'أول' },
      { id: 'p2', text: '   ' },
      { id: 'p3', text: 'ثالث' },
    ]);
    expect(() => validateAIResponse(blank, originals)).toThrow(TranslationFailure);

    const empty = JSON.stringify([
      { id: 'p1', text: '' },
      { id: 'p2', text: 'ثاني' },
      { id: 'p3', text: 'ثالث' },
    ]);
    expect(() => validateAIResponse(empty, originals)).toThrow(TranslationFailure);
  });

  it('rejects texts over the default 30,000-character cap but keeps the boundary', () => {
    const single: TranslationSegment[] = [{ id: 'only', text: 'نص' }];

    const over = JSON.stringify([{ id: 'only', text: 'x'.repeat(30_001) }]);
    expect(() => validateAIResponse(over, single)).toThrow(TranslationFailure);

    const atCap = JSON.stringify([{ id: 'only', text: 'x'.repeat(30_000) }]);
    expect(validateAIResponse(atCap, single)).toEqual([
      { id: 'only', text: 'x'.repeat(30_000) },
    ]);
  });

  it('honours a custom cap argument', () => {
    const single: TranslationSegment[] = [{ id: 'only', text: 'نص' }];

    expect(() =>
      validateAIResponse(JSON.stringify([{ id: 'only', text: 'abcdef' }]), single, 5),
    ).toThrow(TranslationFailure);
    expect(validateAIResponse(JSON.stringify([{ id: 'only', text: 'abcde' }]), single, 5)).toEqual([
      { id: 'only', text: 'abcde' },
    ]);
  });

  it('throws the exact Arabic failure for unparseable payloads', () => {
    const notJson = () => validateAIResponse('ليس JSON إطلاقًا', originals);
    expect(notJson).toThrow(TranslationFailure);
    expect(notJson).toThrow('لم يُرجع نموذج الذكاء الاصطناعي ترجمة مكتملة');

    const notArrayOfObjects = () => validateAIResponse('[1, 2, 3]', originals);
    expect(notArrayOfObjects).toThrow(TranslationFailure);
  });
});
