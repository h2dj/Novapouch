import { describe, expect, it } from 'vitest';
import { attributeTokens, categoryLabels, findBlockedWords, objectTokens, questionCards } from './index';

describe('content', () => {
  it('has the MVP amounts', () => {
    expect(objectTokens).toHaveLength(60);
    expect(attributeTokens).toHaveLength(60);
    expect(questionCards).toHaveLength(30);
  });

  it('has unique ids and labels', () => {
    const all = [...objectTokens, ...attributeTokens, ...questionCards];
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    expect(new Set(objectTokens.map((x) => x.label)).size).toBe(60);
    expect(new Set(attributeTokens.map((x) => x.label)).size).toBe(60);
  });

  it('keeps tokens short enough for a card', () => {
    for (const t of [...objectTokens, ...attributeTokens]) expect(t.label.length).toBeLessThanOrEqual(14);
    for (const t of objectTokens) expect(t.code).toMatch(/^[A-Z]+$/);
  });

  it('gives every category five questions with three choices', () => {
    for (const cat of Object.keys(categoryLabels)) {
      const qs = questionCards.filter((q) => q.category === cat);
      expect(qs).toHaveLength(5);
      for (const q of qs) expect(q.choices).toHaveLength(3);
    }
  });

  it('detects blocked words despite spacing', () => {
    expect(findBlockedWords('비를 모으는 우산')).toEqual([]);
    expect(findBlockedWords('닥 쳐')).toEqual(['닥쳐']);
  });
});
