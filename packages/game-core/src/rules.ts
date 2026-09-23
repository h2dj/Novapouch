import type { FragmentType, Settings } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export const DEFAULT_SETTINGS: Settings = { rounds: 5, answerSeconds: 120, quietMode: true };
export const ROUND_OPTIONS = [3, 4, 5, 6];
export const ANSWER_SECONDS_OPTIONS = [90, 120, 180];

export const DRAW_MS = 20_000;
export const IMAGINE_MS = 5_000;
export const NAMING_MS = 60_000;
export const EXTEND_MS = 30_000;
export const PICK_MS = 30_000;
export const HOST_GRACE_MS = 30_000;
/** 잠깐 끊긴 사람을 기다려 주는 시간. 이 시간이 지나야 남은 사람만으로 진행한다 */
export const PRESENCE_GRACE_MS = 20_000;

export const NAME_MAX = 20;
export const USE_MAX = 60;
export const ANSWER_MAX = 120;
export const WORLD_NAME_MAX = 24;

/** 연결 단계 순서. 시안 기준: 장소·주민 각 1, 규칙 3, 사건 1 */
export const CONNECT_STEPS: { type: FragmentType; pick: number; seconds: number }[] = [
  { type: 'place', pick: 1, seconds: 60 },
  { type: 'resident', pick: 1, seconds: 60 },
  { type: 'rule', pick: 3, seconds: 90 },
  { type: 'event', pick: 1, seconds: 60 },
];

export const fragmentLabels: Record<FragmentType, string> = {
  place: '장소',
  resident: '주민',
  rule: '세계의 규칙',
  event: '사건',
};
