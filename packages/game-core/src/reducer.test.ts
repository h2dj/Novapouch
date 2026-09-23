import { describe, expect, it } from 'vitest';
import {
  buildWorld,
  CONNECT_STEPS,
  connectCandidates,
  createGame,
  GameError,
  gini,
  HOST_GRACE_MS,
  PRESENCE_GRACE_MS,
  nextWakeAt,
  reduce,
  viewFor,
  type Action,
  type GameState,
} from './index';

let clock = 1_000_000;
const now = () => (clock += 1000);

function run(s: GameState, ...actions: Action[]): GameState {
  return actions.reduce(reduce, s);
}

function lobby(n = 3): GameState {
  let s = createGame('7F2A', 42);
  const names = ['보민', '은서', '재현', '도윤', '하린', '서진'];
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'JOIN', playerId: `p${i + 1}`, nickname: names[i]!, now: now() });
  return s;
}

/** 로비부터 탐사 1라운드 질문 고르기 직전까지 */
function toExplore(s: GameState): GameState {
  s = reduce(s, { type: 'START', playerId: s.hostId!, now: now() });
  const d = s.discovererId!;
  s = run(
    s,
    { type: 'OPEN_POUCH', playerId: d, pouch: 'A', now: now() },
    { type: 'OPEN_POUCH', playerId: d, pouch: 'B', now: now() },
  );
  s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
  return reduce(s, { type: 'SUBMIT_DISCOVERY', playerId: d, name: '빗기억 거름우산', use: '하늘의 기억을 걸러 모은다', now: now() });
}

function answerRound(s: GameState, text = (id: string) => `${id}의 문장 ${s.explore!.round}`): GameState {
  const ex = s.explore!;
  s = reduce(s, { type: 'PICK_QUESTION', playerId: ex.turnPlayerId, questionId: ex.offeredQuestionIds[0]!, now: now() });
  for (const p of s.players.filter((x) => x.connected)) {
    if (s.phase !== 'EXPLORE') break;
    s = reduce(s, { type: 'SUBMIT_ANSWER', playerId: p.id, text: text(p.id), fromChoice: false, flagged: false, now: now() });
  }
  return s;
}

describe('lobby', () => {
  it('makes the first player host and rejects a seventh', () => {
    let s = lobby(6);
    expect(s.hostId).toBe('p1');
    expect(() => reduce(s, { type: 'JOIN', playerId: 'p7', nickname: '칠', now: now() })).toThrow(GameError);
    s = reduce(s, { type: 'LEAVE', playerId: 'p1', now: now() });
    expect(s.hostId).toBe('p2');
    expect(s.players).toHaveLength(5);
  });

  it('needs two people and the host to start', () => {
    const one = lobby(1);
    expect(() => reduce(one, { type: 'START', playerId: 'p1', now: now() })).toThrow('두 명 이상');
    const s = lobby(2);
    expect(() => reduce(s, { type: 'START', playerId: 'p2', now: now() })).toThrow('방장만');
  });

  it('validates settings', () => {
    const s = lobby(2);
    expect(reduce(s, { type: 'UPDATE_SETTINGS', playerId: 'p1', settings: { rounds: 3, quietMode: false } }).settings).toEqual({
      rounds: 3,
      answerSeconds: 120,
      quietMode: false,
    });
    expect(() => reduce(s, { type: 'UPDATE_SETTINGS', playerId: 'p1', settings: { rounds: 9 } })).toThrow(GameError);
  });

  it('does not let strangers join a running game but lets members come back', () => {
    let s = reduce(lobby(2), { type: 'START', playerId: 'p1', now: now() });
    expect(() => reduce(s, { type: 'JOIN', playerId: 'x', nickname: '새', now: now() })).toThrow('이미 게임이');
    s = reduce(s, { type: 'CONNECTION', playerId: 'p2', connected: false, now: now() });
    s = reduce(s, { type: 'JOIN', playerId: 'p2', nickname: '은서', now: now() });
    expect(s.players.find((p) => p.id === 'p2')!.connected).toBe(true);
  });
});

describe('draw and naming', () => {
  it('opens both pouches, waits five seconds, then names', () => {
    let s = reduce(lobby(), { type: 'START', playerId: 'p1', now: now() });
    expect(s.phase).toBe('DRAW');
    const d = s.discovererId!;
    const other = s.players.find((p) => p.id !== d && p.id !== s.hostId);
    if (other) expect(() => reduce(s, { type: 'OPEN_POUCH', playerId: other.id, pouch: 'A', now: now() })).toThrow('첫 발견자');
    s = run(s, { type: 'OPEN_POUCH', playerId: d, pouch: 'A', now: now() }, { type: 'OPEN_POUCH', playerId: d, pouch: 'B', now: now() });
    expect(s.phase).toBe('IMAGINE');
    expect(s.objectId).toMatch(/^o\d+$/);
    expect(s.attributeId).toMatch(/^a\d+$/);
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! - 1 });
    expect(s.phase).toBe('IMAGINE');
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    expect(s.phase).toBe('NAMING');
  });

  it('opens the pouches by itself when nobody does', () => {
    let s = reduce(lobby(), { type: 'START', playerId: 'p1', now: now() });
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    expect(s.phase).toBe('IMAGINE');
  });

  it('allows one reroll and one extension', () => {
    let s = reduce(lobby(), { type: 'START', playerId: 'p1', now: now() });
    const d = s.discovererId!;
    s = run(s, { type: 'OPEN_POUCH', playerId: d, pouch: 'A', now: now() }, { type: 'OPEN_POUCH', playerId: d, pouch: 'B', now: now() });
    const before = s.attributeId;
    s = reduce(s, { type: 'REROLL', playerId: d, now: now() });
    expect(s.attributeId).not.toBe(before);
    expect(() => reduce(s, { type: 'REROLL', playerId: d, now: now() })).toThrow('한 번만');
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    const deadline = s.deadlineAt!;
    s = reduce(s, { type: 'EXTEND', playerId: d, now: now() });
    expect(s.deadlineAt).toBe(deadline + 30_000);
    expect(() => reduce(s, { type: 'EXTEND', playerId: d, now: now() })).toThrow('한 번만');
  });

  it('uses the autosaved draft when naming time runs out', () => {
    let s = reduce(lobby(), { type: 'START', playerId: 'p1', now: now() });
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    s = reduce(s, { type: 'DRAFT', playerId: s.discovererId!, text: '거름우산\n기억을 거른다' });
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    expect(s.phase).toBe('EXPLORE');
    expect(s.discovery).toEqual({ name: '거름우산', use: '기억을 거른다' });
  });

  it('falls back to the token names without a draft', () => {
    let s = reduce(lobby(), { type: 'START', playerId: 'p1', now: now() });
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    expect(s.discovery!.name.length).toBeGreaterThan(0);
  });
});

describe('explore', () => {
  it('offers three questions of different categories and rotates the turn', () => {
    let s = toExplore(lobby(3));
    const turns: string[] = [];
    for (let r = 1; r <= 3; r++) {
      expect(s.explore!.offeredQuestionIds).toHaveLength(3);
      turns.push(s.explore!.turnPlayerId);
      s = answerRound(s);
    }
    expect(new Set(turns).size).toBe(3);
  });

  it('only lets the turn player or host pick', () => {
    const s = toExplore(lobby(3));
    const ex = s.explore!;
    const other = s.players.find((p) => p.id !== ex.turnPlayerId && p.id !== s.hostId);
    if (other) {
      expect(() =>
        reduce(s, { type: 'PICK_QUESTION', playerId: other.id, questionId: ex.offeredQuestionIds[0]!, now: now() }),
      ).toThrow('다른 사람');
    }
    expect(() => reduce(s, { type: 'PICK_QUESTION', playerId: ex.turnPlayerId, questionId: 'q99', now: now() })).toThrow(GameError);
  });

  it('auto-picks and moves on when time runs out, submitting drafts', () => {
    let s = toExplore(lobby(3));
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    expect(s.explore!.step).toBe('ANSWER');
    s = reduce(s, { type: 'DRAFT', playerId: 'p2', text: '쓰다 만 문장' });
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    expect(s.explore!.round).toBe(2);
    expect(s.contributions.map((c) => c.text)).toEqual(['쓰다 만 문장']);
  });

  it('hides other answers in quiet mode until the round ends', () => {
    let s = toExplore(lobby(3));
    const ex = s.explore!;
    s = reduce(s, { type: 'PICK_QUESTION', playerId: ex.turnPlayerId, questionId: ex.offeredQuestionIds[0]!, now: now() });
    s = reduce(s, { type: 'SUBMIT_ANSWER', playerId: 'p1', text: '비밀 답', fromChoice: false, flagged: false, now: now() });
    const v2 = viewFor(s, 'p2', { now: now() });
    expect(v2.contributions[0]).toMatchObject({ text: null, masked: 'quiet' });
    expect(v2.answeredIds).toEqual(['p1']);
    expect(viewFor(s, 'p1', { now: now() }).contributions[0]!.text).toBe('비밀 답');
    s = run(
      s,
      { type: 'SUBMIT_ANSWER', playerId: 'p2', text: '둘', fromChoice: true, flagged: false, now: now() },
      { type: 'SUBMIT_ANSWER', playerId: 'p3', text: '셋', fromChoice: false, flagged: false, now: now() },
    );
    expect(viewFor(s, 'p2', { now: now() }).contributions[0]!.text).toBe('비밀 답');
  });

  it('lets a player rewrite their answer within the round', () => {
    let s = toExplore(lobby(3));
    const ex = s.explore!;
    s = reduce(s, { type: 'PICK_QUESTION', playerId: ex.turnPlayerId, questionId: ex.offeredQuestionIds[0]!, now: now() });
    s = reduce(s, { type: 'SUBMIT_ANSWER', playerId: 'p1', text: '처음', fromChoice: false, flagged: false, now: now() });
    s = reduce(s, { type: 'SUBMIT_ANSWER', playerId: 'p1', text: '고친 문장', fromChoice: false, flagged: false, now: now() });
    expect(s.contributions.map((c) => c.text)).toEqual(['고친 문장']);
  });

  it('does not wait for someone who disconnected', () => {
    let s = toExplore(lobby(3));
    const ex = s.explore!;
    s = reduce(s, { type: 'PICK_QUESTION', playerId: ex.turnPlayerId, questionId: ex.offeredQuestionIds[0]!, now: now() });
    s = run(
      s,
      { type: 'SUBMIT_ANSWER', playerId: 'p1', text: '하나', fromChoice: false, flagged: false, now: now() },
      { type: 'SUBMIT_ANSWER', playerId: 'p2', text: '둘', fromChoice: false, flagged: false, now: now() },
    );
    expect(s.explore!.round).toBe(1);
    const t = now();
    s = reduce(s, { type: 'CONNECTION', playerId: 'p3', connected: false, now: t });
    // 잠깐 끊긴 것일 수 있으니 바로 넘어가지 않는다
    expect(s.explore!.round).toBe(1);
    expect(nextWakeAt(s, t)).toBe(t + PRESENCE_GRACE_MS);
    s = reduce(s, { type: 'TICK', now: t + PRESENCE_GRACE_MS });
    expect(s.explore!.round).toBe(2);
  });
});

function toConnect(): GameState {
  let s = reduce(lobby(3), { type: 'UPDATE_SETTINGS', playerId: 'p1', settings: { rounds: 3 } });
  s = toExplore(s);
  while (s.phase === 'EXPLORE') s = answerRound(s);
  return s;
}

describe('connect and record', () => {
  it('moves to connect after the last round', () => {
    const s = toConnect();
    expect(s.phase).toBe('CONNECT');
    expect(s.contributions).toHaveLength(9);
    expect(connectCandidates(s)).toHaveLength(9);
  });

  it('confirms the most voted fragment and breaks ties with the host', () => {
    let s = toConnect();
    s = reduce(s, { type: 'PROPOSE_FRAGMENT', playerId: 'p2', text: '비가 멈추지 않는 지붕 도시', flagged: false, now: now() });
    const place = s.contributions.at(-1)!.id;
    const [a, b] = s.contributions.map((c) => c.id);
    s = run(
      s,
      { type: 'VOTE', playerId: 'p1', contributionIds: [place], now: now() },
      { type: 'VOTE', playerId: 'p2', contributionIds: [place], now: now() },
      { type: 'VOTE', playerId: 'p3', contributionIds: [a!], now: now() },
    );
    expect(s.connect!.confirmed.place).toEqual([place]);
    expect(s.connect!.stepIndex).toBe(1);
    // 주민: 1:1 동률이면 방장(p1)의 선택
    s = run(
      s,
      { type: 'VOTE', playerId: 'p1', contributionIds: [b!], now: now() },
      { type: 'VOTE', playerId: 'p2', contributionIds: [a!], now: now() },
      { type: 'VOTE', playerId: 'p3', contributionIds: [], now: now() },
    );
    expect(s.connect!.confirmed.resident).toEqual([b]);
  });

  it('limits rule picks to three and moves through every step to record', () => {
    let s = toConnect();
    s = reduce(s, { type: 'CLOSE_STEP', playerId: 'p1', now: now() });
    s = reduce(s, { type: 'CLOSE_STEP', playerId: 'p1', now: now() });
    expect(CONNECT_STEPS[s.connect!.stepIndex]!.type).toBe('rule');
    const ids = s.contributions.map((c) => c.id);
    expect(() => reduce(s, { type: 'VOTE', playerId: 'p1', contributionIds: ids.slice(0, 4), now: now() })).toThrow('3개까지');
    s = run(
      s,
      { type: 'VOTE', playerId: 'p1', contributionIds: ids.slice(0, 3), now: now() },
      { type: 'VOTE', playerId: 'p2', contributionIds: ids.slice(0, 2), now: now() },
      { type: 'VOTE', playerId: 'p3', contributionIds: [ids[5]!], now: now() },
    );
    expect(s.connect!.confirmed.rule).toEqual([ids[0], ids[1], ids[2]]);
    s = reduce(s, { type: 'TICK', now: s.deadlineAt! });
    expect(s.phase).toBe('RECORD');
    expect(s.record!.proposals[0]!.text).toBe('빗기억 거름우산');
  });

  it('hiding a sentence removes it from candidates and confirmed fragments', () => {
    let s = toConnect();
    const id = s.contributions[0]!.id;
    s = reduce(s, { type: 'VOTE', playerId: 'p2', contributionIds: [id], now: now() });
    s = reduce(s, { type: 'HIDE', playerId: 'p1', contributionId: id, hidden: true });
    expect(connectCandidates(s).map((c) => c.id)).not.toContain(id);
    expect(s.connect!.votes.p2).toEqual([]);
    expect(viewFor(s, 'p2', { now: now() }).contributions[0]!.masked).toBe('hidden');
    expect(viewFor(s, 'p1', { now: now() }).contributions[0]!.text).not.toBeNull();
    expect(() => reduce(s, { type: 'HIDE', playerId: 'p2', contributionId: id, hidden: false })).toThrow('방장만');
  });

  it('builds a world with the voted name, fragments and stars', () => {
    let s = toConnect();
    const [first, second] = s.contributions;
    s = run(
      s,
      { type: 'VOTE', playerId: 'p1', contributionIds: [first!.id], now: now() },
      { type: 'VOTE', playerId: 'p2', contributionIds: [first!.id], now: now() },
      { type: 'VOTE', playerId: 'p3', contributionIds: [first!.id], now: now() },
    );
    for (let i = 0; i < 3; i++) s = reduce(s, { type: 'CLOSE_STEP', playerId: 'p1', now: now() });
    s = run(
      s,
      { type: 'PROPOSE_NAME', playerId: 'p2', text: '비의 기억을 거르는 도시' },
      { type: 'VOTE_NAME', playerId: 'p1', proposalId: 'p0' },
    );
    const proposal = s.record!.proposals.find((p) => p.text === '비의 기억을 거르는 도시')!;
    s = run(
      s,
      { type: 'VOTE_NAME', playerId: 'p2', proposalId: proposal.id },
      { type: 'VOTE_NAME', playerId: 'p3', proposalId: proposal.id },
      { type: 'GIVE_STAR', playerId: 'p1', contributionId: second!.id, kind: 'afterglow' },
      { type: 'GIVE_STAR', playerId: 'p3', contributionId: second!.id, kind: 'afterglow' },
    );
    expect(() => reduce(s, { type: 'GIVE_STAR', playerId: second!.playerId, contributionId: second!.id, kind: 'surprise' })).toThrow('내 문장');
    s = reduce(s, { type: 'FINALIZE', playerId: 'p1', worldId: 'w1', now: now() });
    expect(s.phase).toBe('DONE');
    const w = buildWorld(s, { id: 'w1', serialNo: 42, now: now() });
    expect(w.name).toBe('비의 기억을 거르는 도시');
    expect(w.serial).toMatch(/^[A-Z]+ 042$/);
    expect(w.fragments).toEqual([expect.objectContaining({ type: 'place', contributionId: first!.id })]);
    expect(w.timeline[0]!.phase).toBe('discovery');
    expect(w.timeline.find((e) => e.id === second!.id)!.stars).toEqual({ afterglow: 2 });
    expect(w.members).toEqual(['보민', '은서', '재현']);

    const again = reduce(s, { type: 'RESTART', playerId: 'p1' });
    expect(again.phase).toBe('LOBBY');
    expect(again.contributions).toEqual([]);
  });
});

describe('host handover', () => {
  it('passes the host role after the grace period', () => {
    let s = reduce(lobby(3), { type: 'START', playerId: 'p1', now: now() });
    const t = now();
    s = reduce(s, { type: 'CONNECTION', playerId: 'p1', connected: false, now: t });
    expect(nextWakeAt(s, t)).toBe(Math.min(s.deadlineAt!, t + HOST_GRACE_MS));
    s = reduce(s, { type: 'TICK', now: t + HOST_GRACE_MS - 1 });
    expect(s.hostId).toBe('p1');
    s = reduce(s, { type: 'TICK', now: t + HOST_GRACE_MS });
    expect(s.hostId).toBe('p2');
  });

  it('never asks to wake up in the past', () => {
    let s = lobby(1);
    const t = now();
    s = reduce(s, { type: 'CONNECTION', playerId: 'p1', connected: false, now: t });
    expect(nextWakeAt(s, t + HOST_GRACE_MS + 1)).toBeNull();
  });
});

describe('metrics', () => {
  it('computes a gini coefficient', () => {
    expect(gini([10, 10, 10])).toBe(0);
    expect(gini([0, 0, 30])).toBeCloseTo(2 / 3);
    expect(gini([])).toBe(0);
  });
});

describe('determinism', () => {
  it('gives the same draw for the same seed and actions', () => {
    const play = () => toExplore(lobby(3));
    const a = play();
    const b = play();
    expect([a.objectId, a.attributeId, a.discovererId]).toEqual([b.objectId, b.attributeId, b.discovererId]);
  });
});
