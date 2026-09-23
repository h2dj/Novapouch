import { attributeTokens, objectTokens, questionCards } from './cards';
import type { QuestionCategory, Token, QuestionCard } from './types';

export * from './types';
export { attributeTokens, objectTokens, questionCards } from './cards';
export { findBlockedWords } from './moderation';

export const categoryLabels: Record<QuestionCategory, string> = {
  use: '쓰임',
  cost: '대가',
  place: '장소',
  memory: '기억',
  society: '사회',
  change: '변화',
};

const byId = new Map<string, Token | QuestionCard>(
  [...objectTokens, ...attributeTokens, ...questionCards].map((x) => [x.id, x]),
);

export function getToken(id: string | undefined): Token | undefined {
  const t = id ? byId.get(id) : undefined;
  return t && 'pouch' in t ? t : undefined;
}

export function getQuestion(id: string | undefined): QuestionCard | undefined {
  const q = id ? byId.get(id) : undefined;
  return q && 'category' in q ? q : undefined;
}
