import { connectCandidates } from './reducer';
import type { Contribution, GameState } from './types';

export interface ViewContribution extends Omit<Contribution, 'text'> {
  /** 가려진 문장은 null. 이유는 masked에 담는다 */
  text: string | null;
  masked: 'quiet' | 'hidden' | 'blocked' | null;
}

export interface GameView extends Omit<GameState, 'seed' | 'drafts' | 'contributions'> {
  you: string;
  myDraft: string;
  contributions: ViewContribution[];
  /** 이번 라운드에 답을 낸 사람 */
  answeredIds: string[];
  /** 연결 단계에서 지금 고를 수 있는 조각 */
  candidateIds: string[];
  /** 이 방에 있는, 내가 차단한 사람 */
  blockedIds: string[];
  serverTime: number;
}

/** 한 사람에게 보낼 상태. 다른 사람의 초안, 고요한 탐사 중인 답, 숨김·차단된 문장을 가린다 */
export function viewFor(s: GameState, you: string, opts: { now: number; blockedIds?: string[] }): GameView {
  const { seed: _seed, drafts, contributions, ...rest } = s;
  const blocked = new Set(opts.blockedIds ?? []);
  const ex = s.explore;
  const quietRound = s.phase === 'EXPLORE' && ex?.step === 'ANSWER' && s.settings.quietMode ? ex.round : null;
  const isHost = s.hostId === you;

  const view: ViewContribution[] = contributions.map((c) => {
    let masked: ViewContribution['masked'] = null;
    if (c.playerId !== you) {
      if (c.hidden && !isHost) masked = 'hidden';
      else if (blocked.has(c.playerId)) masked = 'blocked';
      else if (quietRound !== null && c.phase === 'explore' && c.round === quietRound) masked = 'quiet';
    }
    return { ...c, text: masked ? null : c.text, masked };
  });

  const answeredIds =
    s.phase === 'EXPLORE' && ex
      ? [...new Set(contributions.filter((c) => c.phase === 'explore' && c.round === ex.round).map((c) => c.playerId))]
      : [];

  return {
    ...rest,
    you,
    myDraft: drafts[you] ?? '',
    contributions: view,
    answeredIds,
    candidateIds: connectCandidates(s).map((c) => c.id),
    blockedIds: [...blocked].filter((id) => s.players.some((p) => p.id === id)),
    serverTime: opts.now,
  };
}
