export type Pouch = 'A' | 'B';

export interface Token {
  id: string;
  pouch: Pouch;
  label: string;
  /** 사물 토큰의 영문 코드. 세계 일련번호(UMBRELLA 042)에 쓴다. */
  code?: string;
}

export type QuestionCategory = 'use' | 'cost' | 'place' | 'memory' | 'society' | 'change';

export interface QuestionCard {
  id: string;
  category: QuestionCategory;
  text: string;
  /** 조용한 참여: 글 대신 고를 수 있는 선택지 3개 */
  choices: string[];
}
