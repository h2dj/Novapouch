export type Phase = 'LOBBY' | 'DRAW' | 'IMAGINE' | 'NAMING' | 'EXPLORE' | 'CONNECT' | 'RECORD' | 'DONE';

export type FragmentType = 'place' | 'resident' | 'rule' | 'event';
export type StarKind = 'surprise' | 'connection' | 'afterglow';
export type Visibility = 'members' | 'link';

export interface Player {
  id: string;
  nickname: string;
  joinedAt: number;
  connected: boolean;
  /** 연결이 끊긴 시각. 방장 자동 위임에 쓴다. */
  disconnectedAt: number | null;
}

export interface Settings {
  rounds: number;
  answerSeconds: number;
  quietMode: boolean;
}

export interface Contribution {
  id: string;
  playerId: string;
  phase: 'explore' | 'connect';
  round: number | null;
  questionId: string | null;
  /** 연결 단계에서 직접 제안한 조각의 종류 */
  fragmentType: FragmentType | null;
  text: string;
  /** 조용한 참여: 글 대신 준비된 선택지를 골랐는지 */
  fromChoice: boolean;
  hidden: boolean;
  flagged: boolean;
  at: number;
}

export interface Discovery {
  name: string;
  use: string;
}

export interface ExploreState {
  round: number;
  step: 'PICK' | 'ANSWER';
  turnPlayerId: string;
  offeredQuestionIds: string[];
  questionId: string | null;
  usedQuestionIds: string[];
}

export interface ConnectState {
  stepIndex: number;
  /** 플레이어별로 이번 단계에서 고른 조각 id. 키가 있으면 투표를 마친 것 */
  votes: Record<string, string[]>;
  confirmed: Record<FragmentType, string[]>;
}

export interface NameProposal {
  id: string;
  playerId: string;
  text: string;
}

export interface Star {
  fromPlayerId: string;
  contributionId: string;
  kind: StarKind;
}

export interface RecordState {
  proposals: NameProposal[];
  votes: Record<string, string>;
  visibility: Visibility;
  stars: Star[];
}

export interface GameState {
  code: string;
  phase: Phase;
  hostId: string | null;
  players: Player[];
  settings: Settings;
  /** 상태가 바뀔 때마다 1씩 오른다. 클라이언트가 오래된 스냅샷을 버리는 데 쓴다 */
  seq: number;
  /** 결정적 난수 상태. 클라이언트에는 보내지 않는다 */
  seed: number;
  gameNo: number;
  startedAt: number | null;
  deadlineAt: number | null;
  extendUsed: boolean;
  discovererId: string | null;
  opened: { A: boolean; B: boolean };
  objectId: string | null;
  attributeId: string | null;
  rerollUsed: boolean;
  discovery: Discovery | null;
  contributions: Contribution[];
  drafts: Record<string, string>;
  explore: ExploreState | null;
  connect: ConnectState | null;
  record: RecordState | null;
  worldId: string | null;
  nextId: number;
}

export type Action =
  | { type: 'JOIN'; playerId: string; nickname: string; now: number }
  | { type: 'LEAVE'; playerId: string; now: number }
  | { type: 'CONNECTION'; playerId: string; connected: boolean; now: number }
  | { type: 'UPDATE_SETTINGS'; playerId: string; settings: Partial<Settings> }
  | { type: 'START'; playerId: string; now: number }
  | { type: 'OPEN_POUCH'; playerId: string; pouch: 'A' | 'B'; now: number }
  | { type: 'REROLL'; playerId: string; now: number }
  | { type: 'DRAFT'; playerId: string; text: string }
  | { type: 'EXTEND'; playerId: string; now: number }
  | { type: 'SUBMIT_DISCOVERY'; playerId: string; name: string; use: string; now: number }
  | { type: 'PICK_QUESTION'; playerId: string; questionId: string; now: number }
  | { type: 'SUBMIT_ANSWER'; playerId: string; text: string; fromChoice: boolean; flagged: boolean; now: number }
  | { type: 'PROPOSE_FRAGMENT'; playerId: string; text: string; flagged: boolean; now: number }
  | { type: 'VOTE'; playerId: string; contributionIds: string[]; now: number }
  | { type: 'CLOSE_STEP'; playerId: string; now: number }
  | { type: 'PROPOSE_NAME'; playerId: string; text: string }
  | { type: 'VOTE_NAME'; playerId: string; proposalId: string }
  | { type: 'SET_VISIBILITY'; playerId: string; visibility: Visibility }
  | { type: 'GIVE_STAR'; playerId: string; contributionId: string; kind: StarKind }
  | { type: 'FINALIZE'; playerId: string; worldId: string; now: number }
  | { type: 'RESTART'; playerId: string }
  | { type: 'HIDE'; playerId: string; contributionId: string; hidden: boolean }
  | { type: 'TICK'; now: number };

export class GameError extends Error {}
