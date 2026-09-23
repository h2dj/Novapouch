import { attributeTokens, objectTokens, questionCards } from '@novapouch/content';
import {
  ANSWER_MAX,
  ANSWER_SECONDS_OPTIONS,
  CONNECT_STEPS,
  DEFAULT_SETTINGS,
  DRAW_MS,
  EXTEND_MS,
  HOST_GRACE_MS,
  IMAGINE_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NAME_MAX,
  NAMING_MS,
  PICK_MS,
  PRESENCE_GRACE_MS,
  ROUND_OPTIONS,
  USE_MAX,
  WORLD_NAME_MAX,
} from './rules';
import { GameError, type Action, type ConnectState, type Contribution, type GameState, type Player } from './types';

export function createGame(code: string, seed: number): GameState {
  return {
    code,
    phase: 'LOBBY',
    hostId: null,
    players: [],
    settings: { ...DEFAULT_SETTINGS },
    seq: 0,
    seed: seed >>> 0 || 1,
    gameNo: 0,
    startedAt: null,
    deadlineAt: null,
    extendUsed: false,
    discovererId: null,
    opened: { A: false, B: false },
    objectId: null,
    attributeId: null,
    rerollUsed: false,
    discovery: null,
    contributions: [],
    drafts: {},
    explore: null,
    connect: null,
    record: null,
    worldId: null,
    nextId: 1,
  };
}

/** 상태를 바꾸지 않고 새 상태를 돌려준다. 규칙에 맞지 않는 행동은 GameError를 던진다. */
export function reduce(state: GameState, action: Action): GameState {
  const s = structuredClone(state);
  apply(s, action);
  s.seq = state.seq + 1;
  return s;
}

/** 서버가 다음으로 TICK을 보내야 하는 시각. 이미 지난 시각은 다시 깨우지 않는다 */
export function nextWakeAt(s: GameState, now: number): number | null {
  const times: number[] = [];
  if (s.deadlineAt !== null) times.push(s.deadlineAt);
  const host = s.players.find((p) => p.id === s.hostId);
  if (host && !host.connected && host.disconnectedAt !== null) times.push(host.disconnectedAt + HOST_GRACE_MS);
  if (s.phase === 'EXPLORE' || s.phase === 'CONNECT') {
    for (const p of s.players) if (!p.connected && p.disconnectedAt !== null) times.push(p.disconnectedAt + PRESENCE_GRACE_MS);
  }
  const future = times.filter((t) => t > now);
  if (s.deadlineAt !== null && s.deadlineAt <= now) future.push(now);
  return future.length ? Math.min(...future) : null;
}

// ---------------------------------------------------------------------------

function apply(s: GameState, a: Action): void {
  switch (a.type) {
    case 'JOIN':
      return join(s, a.playerId, a.nickname, a.now);
    case 'LEAVE':
      return leave(s, a.playerId, a.now);
    case 'CONNECTION': {
      const p = requirePlayer(s, a.playerId);
      p.connected = a.connected;
      p.disconnectedAt = a.connected ? null : a.now;
      if (a.connected && !s.hostId) s.hostId = p.id;
      return maybeAdvanceOnPresence(s, a.now);
    }
    case 'UPDATE_SETTINGS': {
      requireHost(s, a.playerId);
      requirePhase(s, 'LOBBY', 'DONE');
      const next = { ...s.settings, ...a.settings };
      if (!ROUND_OPTIONS.includes(next.rounds)) throw new GameError('라운드 수는 3~6회 중에서 고를 수 있어요.');
      if (!ANSWER_SECONDS_OPTIONS.includes(next.answerSeconds)) throw new GameError('답변 시간을 다시 골라 주세요.');
      s.settings = { rounds: next.rounds, answerSeconds: next.answerSeconds, quietMode: Boolean(next.quietMode) };
      return;
    }
    case 'START':
      return start(s, a.playerId, a.now);
    case 'OPEN_POUCH': {
      requirePhase(s, 'DRAW');
      requireDiscovererOrHost(s, a.playerId);
      openPouch(s, a.pouch, a.now);
      return;
    }
    case 'REROLL': {
      requirePhase(s, 'IMAGINE', 'NAMING');
      requireDiscovererOrHost(s, a.playerId);
      if (s.rerollUsed) throw new GameError('다시 흔들기는 한 게임에 한 번만 쓸 수 있어요.');
      s.rerollUsed = true;
      s.attributeId = pickFrom(s, attributeTokens.map((t) => t.id).filter((id) => id !== s.attributeId));
      if (s.phase === 'IMAGINE') s.deadlineAt = a.now + IMAGINE_MS;
      return;
    }
    case 'DRAFT': {
      requirePlayer(s, a.playerId);
      s.drafts[a.playerId] = a.text.slice(0, 400);
      return;
    }
    case 'EXTEND': {
      requirePhase(s, 'NAMING');
      requireDiscovererOrHost(s, a.playerId);
      if (s.extendUsed) throw new GameError('시간 연장은 한 번만 쓸 수 있어요.');
      s.extendUsed = true;
      s.deadlineAt = Math.max(s.deadlineAt ?? a.now, a.now) + EXTEND_MS;
      return;
    }
    case 'SUBMIT_DISCOVERY': {
      requirePhase(s, 'NAMING');
      requireDiscovererOrHost(s, a.playerId);
      const name = clean(a.name, NAME_MAX);
      if (!name) throw new GameError('물건의 이름을 적어 주세요.');
      finishNaming(s, { name, use: clean(a.use, USE_MAX) }, a.now);
      return;
    }
    case 'PICK_QUESTION': {
      requirePhase(s, 'EXPLORE');
      const ex = s.explore!;
      if (ex.step !== 'PICK') throw new GameError('이미 질문이 골라졌어요.');
      if (ex.turnPlayerId !== a.playerId && s.hostId !== a.playerId) throw new GameError('지금은 다른 사람이 질문을 고를 차례예요.');
      if (!ex.offeredQuestionIds.includes(a.questionId)) throw new GameError('펼쳐진 질문 카드 중에서 골라 주세요.');
      beginAnswer(s, a.questionId, a.now);
      return;
    }
    case 'SUBMIT_ANSWER': {
      requirePhase(s, 'EXPLORE');
      const ex = s.explore!;
      if (ex.step !== 'ANSWER') throw new GameError('아직 질문이 정해지지 않았어요.');
      requirePlayer(s, a.playerId);
      const text = clean(a.text, ANSWER_MAX);
      if (!text) throw new GameError('한 문장을 적거나 선택지를 골라 주세요.');
      upsertAnswer(s, a.playerId, text, a.fromChoice, a.flagged, a.now);
      delete s.drafts[a.playerId];
      if (everyoneAnswered(s, a.now)) endRound(s, a.now);
      return;
    }
    case 'PROPOSE_FRAGMENT': {
      requirePhase(s, 'CONNECT');
      requirePlayer(s, a.playerId);
      const text = clean(a.text, ANSWER_MAX);
      if (!text) throw new GameError('조각의 내용을 적어 주세요.');
      const step = CONNECT_STEPS[s.connect!.stepIndex]!;
      s.contributions.push(
        makeContribution(s, {
          playerId: a.playerId,
          phase: 'connect',
          round: null,
          questionId: null,
          fragmentType: step.type,
          text,
          fromChoice: false,
          flagged: a.flagged,
          at: a.now,
        }),
      );
      return;
    }
    case 'VOTE': {
      requirePhase(s, 'CONNECT');
      requirePlayer(s, a.playerId);
      const step = CONNECT_STEPS[s.connect!.stepIndex]!;
      const allowed = new Set(connectCandidates(s).map((c) => c.id));
      const ids = [...new Set(a.contributionIds)].filter((id) => allowed.has(id));
      if (ids.length !== a.contributionIds.length) throw new GameError('후보에 없는 조각이 있어요.');
      const already = s.connect!.confirmed[step.type].length;
      if (ids.length > step.pick - already) throw new GameError(`${step.pick - already}개까지 고를 수 있어요.`);
      s.connect!.votes[a.playerId] = ids;
      if (presentPlayers(s, a.now).every((p) => p.id in s.connect!.votes)) closeConnectStep(s, a.now);
      return;
    }
    case 'CLOSE_STEP': {
      requirePhase(s, 'CONNECT');
      requireHost(s, a.playerId);
      closeConnectStep(s, a.now);
      return;
    }
    case 'PROPOSE_NAME': {
      requirePhase(s, 'RECORD');
      requirePlayer(s, a.playerId);
      const text = clean(a.text, WORLD_NAME_MAX);
      if (!text) throw new GameError('세계의 이름을 적어 주세요.');
      const rec = s.record!;
      const mine = rec.proposals.find((p) => p.playerId === a.playerId && p.id !== 'p0');
      if (mine) mine.text = text;
      else rec.proposals.push({ id: `p${s.nextId++}`, playerId: a.playerId, text });
      return;
    }
    case 'VOTE_NAME': {
      requirePhase(s, 'RECORD');
      requirePlayer(s, a.playerId);
      if (!s.record!.proposals.some((p) => p.id === a.proposalId)) throw new GameError('없는 이름이에요.');
      s.record!.votes[a.playerId] = a.proposalId;
      return;
    }
    case 'SET_VISIBILITY': {
      requirePhase(s, 'RECORD');
      requireHost(s, a.playerId);
      s.record!.visibility = a.visibility === 'link' ? 'link' : 'members';
      return;
    }
    case 'GIVE_STAR': {
      requirePhase(s, 'RECORD', 'DONE');
      requirePlayer(s, a.playerId);
      const c = s.contributions.find((x) => x.id === a.contributionId && !x.hidden);
      if (!c) throw new GameError('별을 보낼 문장을 찾지 못했어요.');
      if (c.playerId === a.playerId) throw new GameError('내 문장에는 별을 보낼 수 없어요.');
      const stars = s.record!.stars;
      const i = stars.findIndex((x) => x.fromPlayerId === a.playerId && x.contributionId === a.contributionId);
      const same = i >= 0 && stars[i]!.kind === a.kind;
      if (i >= 0) stars.splice(i, 1);
      if (!same) stars.push({ fromPlayerId: a.playerId, contributionId: a.contributionId, kind: a.kind });
      return;
    }
    case 'FINALIZE': {
      requirePhase(s, 'RECORD');
      requireHost(s, a.playerId);
      s.worldId = a.worldId;
      s.phase = 'DONE';
      s.deadlineAt = null;
      return;
    }
    case 'RESTART': {
      requirePhase(s, 'DONE');
      requireHost(s, a.playerId);
      resetRound(s);
      s.phase = 'LOBBY';
      return;
    }
    case 'HIDE': {
      requireHost(s, a.playerId);
      const c = s.contributions.find((x) => x.id === a.contributionId);
      if (!c) throw new GameError('문장을 찾지 못했어요.');
      if (s.phase === 'DONE') throw new GameError('저장된 세계는 수정할 수 없어요.');
      c.hidden = a.hidden;
      if (a.hidden && s.connect) {
        for (const type of Object.keys(s.connect.confirmed) as (keyof ConnectState['confirmed'])[]) {
          s.connect.confirmed[type] = s.connect.confirmed[type].filter((id) => id !== c.id);
        }
        for (const pid of Object.keys(s.connect.votes)) {
          s.connect.votes[pid] = s.connect.votes[pid]!.filter((id) => id !== c.id);
        }
      }
      return;
    }
    case 'TICK':
      return tick(s, a.now);
  }
}

// --- 입장과 퇴장 --------------------------------------------------------------

function join(s: GameState, playerId: string, nickname: string, now: number) {
  const name = clean(nickname, 12);
  if (!name) throw new GameError('닉네임을 적어 주세요.');
  const existing = s.players.find((p) => p.id === playerId);
  if (existing) {
    existing.nickname = name;
    existing.connected = true;
    existing.disconnectedAt = null;
  } else {
    if (s.players.length >= MAX_PLAYERS) throw new GameError('방이 가득 찼어요. (최대 6명)');
    if (s.phase !== 'LOBBY' && s.phase !== 'DONE') throw new GameError('이미 게임이 시작된 방이에요. 다음 판을 기다려 주세요.');
    s.players.push({ id: playerId, nickname: name, joinedAt: now, connected: true, disconnectedAt: null });
  }
  if (!s.hostId || !s.players.some((p) => p.id === s.hostId)) s.hostId = playerId;
}

function leave(s: GameState, playerId: string, now: number) {
  requirePlayer(s, playerId);
  if (s.phase === 'LOBBY' || s.phase === 'DONE') {
    s.players = s.players.filter((p) => p.id !== playerId);
    delete s.drafts[playerId];
  } else {
    const p = requirePlayer(s, playerId);
    p.connected = false;
    p.disconnectedAt = now;
  }
  if (s.hostId === playerId) s.hostId = nextHost(s, playerId);
  maybeAdvanceOnPresence(s, now);
}

function nextHost(s: GameState, except: string): string | null {
  const byJoin = [...s.players].sort((a, b) => a.joinedAt - b.joinedAt);
  return (byJoin.find((p) => p.id !== except && p.connected) ?? byJoin.find((p) => p.id !== except))?.id ?? null;
}

/** 누군가 나가거나 끊겨도 남은 사람만으로 진행이 막히지 않게 한다 */
function maybeAdvanceOnPresence(s: GameState, now: number) {
  if (s.phase === 'EXPLORE' && s.explore!.step === 'ANSWER' && everyoneAnswered(s, now)) endRound(s, now);
  const present = presentPlayers(s, now);
  if (s.phase === 'CONNECT' && present.length > 0 && present.every((p) => p.id in s.connect!.votes)) {
    closeConnectStep(s, now);
  }
}

/** 연결돼 있거나, 끊긴 지 얼마 안 돼 돌아올 수 있는 사람 */
function presentPlayers(s: GameState, now: number): Player[] {
  return s.players.filter((p) => p.connected || (p.disconnectedAt !== null && now < p.disconnectedAt + PRESENCE_GRACE_MS));
}

// --- 게임 흐름 ---------------------------------------------------------------

function start(s: GameState, playerId: string, now: number) {
  requirePhase(s, 'LOBBY');
  requireHost(s, playerId);
  const present = connectedPlayers(s);
  if (present.length < MIN_PLAYERS) throw new GameError('두 명 이상 모여야 시작할 수 있어요.');
  resetRound(s);
  s.players = s.players.filter((p) => p.connected);
  s.gameNo += 1;
  s.startedAt = now;
  s.phase = 'DRAW';
  s.discovererId = pickFrom(s, present.map((p) => p.id));
  s.deadlineAt = now + DRAW_MS;
}

function openPouch(s: GameState, pouch: 'A' | 'B', now: number) {
  if (s.opened[pouch]) return;
  s.opened[pouch] = true;
  if (pouch === 'A') s.objectId = pickFrom(s, objectTokens.map((t) => t.id));
  else s.attributeId = pickFrom(s, attributeTokens.map((t) => t.id));
  if (s.opened.A && s.opened.B) {
    s.phase = 'IMAGINE';
    s.deadlineAt = now + IMAGINE_MS;
  }
}

function finishNaming(s: GameState, discovery: { name: string; use: string }, now: number) {
  s.discovery = discovery;
  if (s.discovererId) delete s.drafts[s.discovererId];
  s.phase = 'EXPLORE';
  const first = turnPlayerFor(s, 1);
  s.explore = { round: 1, step: 'PICK', turnPlayerId: first, offeredQuestionIds: [], questionId: null, usedQuestionIds: [] };
  offerQuestions(s);
  s.deadlineAt = now + PICK_MS;
}

function turnPlayerFor(s: GameState, round: number): string {
  const order = [...s.players].sort((a, b) => a.joinedAt - b.joinedAt);
  const startIdx = Math.max(0, order.findIndex((p) => p.id === s.discovererId));
  for (let k = 0; k < order.length; k++) {
    const p = order[(startIdx + round + k) % order.length]!;
    if (p.connected) return p.id;
  }
  return order[(startIdx + round) % order.length]!.id;
}

/** 아직 쓰지 않은 질문 중 서로 다른 범주 3장을 펼친다 */
function offerQuestions(s: GameState) {
  const ex = s.explore!;
  let pool = questionCards.filter((q) => !ex.usedQuestionIds.includes(q.id));
  if (pool.length < 3) pool = [...questionCards];
  const offered: string[] = [];
  const cats = new Set<string>();
  const shuffled = shuffle(s, pool);
  for (const q of shuffled) {
    if (offered.length === 3) break;
    if (!cats.has(q.category)) {
      offered.push(q.id);
      cats.add(q.category);
    }
  }
  ex.offeredQuestionIds = offered;
}

function beginAnswer(s: GameState, questionId: string, now: number) {
  const ex = s.explore!;
  ex.step = 'ANSWER';
  ex.questionId = questionId;
  ex.usedQuestionIds.push(questionId);
  s.deadlineAt = now + s.settings.answerSeconds * 1000;
}

function upsertAnswer(s: GameState, playerId: string, text: string, fromChoice: boolean, flagged: boolean, now: number) {
  const ex = s.explore!;
  const prev = s.contributions.find((c) => c.phase === 'explore' && c.round === ex.round && c.playerId === playerId);
  if (prev) {
    Object.assign(prev, { text, fromChoice, flagged, at: now });
    return;
  }
  s.contributions.push(
    makeContribution(s, {
      playerId,
      phase: 'explore',
      round: ex.round,
      questionId: ex.questionId,
      fragmentType: null,
      text,
      fromChoice,
      flagged,
      at: now,
    }),
  );
}

function everyoneAnswered(s: GameState, now: number): boolean {
  const ex = s.explore!;
  const answered = new Set(
    s.contributions.filter((c) => c.phase === 'explore' && c.round === ex.round).map((c) => c.playerId),
  );
  const present = presentPlayers(s, now);
  return present.length > 0 && present.every((p) => answered.has(p.id));
}

function endRound(s: GameState, now: number) {
  const ex = s.explore!;
  // 입력 중이던 초안은 자동 저장된 문장으로 제출한다
  for (const p of s.players) {
    const draft = clean(s.drafts[p.id] ?? '', ANSWER_MAX);
    const has = s.contributions.some((c) => c.phase === 'explore' && c.round === ex.round && c.playerId === p.id);
    if (draft && !has) upsertAnswer(s, p.id, draft, false, false, now);
    delete s.drafts[p.id];
  }
  if (ex.round >= s.settings.rounds) {
    beginConnect(s, now);
    return;
  }
  ex.round += 1;
  ex.step = 'PICK';
  ex.questionId = null;
  ex.turnPlayerId = turnPlayerFor(s, ex.round);
  offerQuestions(s);
  s.deadlineAt = now + PICK_MS;
}

function beginConnect(s: GameState, now: number) {
  s.phase = 'CONNECT';
  s.connect = { stepIndex: 0, votes: {}, confirmed: { place: [], resident: [], rule: [], event: [] } };
  s.deadlineAt = now + CONNECT_STEPS[0]!.seconds * 1000;
}

/** 이번 연결 단계에서 고를 수 있는 조각: 탐사 문장 전체 + 이 단계에 직접 제안된 조각 (이미 확정된 것 제외) */
export function connectCandidates(s: GameState): Contribution[] {
  if (!s.connect) return [];
  const step = CONNECT_STEPS[s.connect.stepIndex]!;
  const used = new Set(Object.values(s.connect.confirmed).flat());
  return s.contributions.filter(
    (c) =>
      !c.hidden &&
      !used.has(c.id) &&
      (c.phase === 'explore' || (c.phase === 'connect' && c.fragmentType === step.type)),
  );
}

function closeConnectStep(s: GameState, now: number) {
  const con = s.connect!;
  const step = CONNECT_STEPS[con.stepIndex]!;
  const need = step.pick - con.confirmed[step.type].length;
  const count = new Map<string, number>();
  for (const ids of Object.values(con.votes)) for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  const hostVotes = new Set(s.hostId ? con.votes[s.hostId] ?? [] : []);
  const order = new Map(s.contributions.map((c, i) => [c.id, i]));
  const ranked = [...count.entries()]
    .filter(([, n]) => n > 0)
    .sort(
      ([a, na], [b, nb]) =>
        nb - na || Number(hostVotes.has(b)) - Number(hostVotes.has(a)) || (order.get(a) ?? 0) - (order.get(b) ?? 0),
    )
    .map(([id]) => id);
  con.confirmed[step.type].push(...ranked.slice(0, need));
  con.votes = {};
  if (con.stepIndex + 1 < CONNECT_STEPS.length) {
    con.stepIndex += 1;
    s.deadlineAt = now + CONNECT_STEPS[con.stepIndex]!.seconds * 1000;
    return;
  }
  beginRecord(s);
}

function beginRecord(s: GameState) {
  s.phase = 'RECORD';
  s.deadlineAt = null;
  const proposals = s.discovery ? [{ id: 'p0', playerId: s.discovererId ?? '', text: s.discovery.name }] : [];
  s.record = { proposals, votes: {}, visibility: 'members', stars: [] };
}

function tick(s: GameState, now: number) {
  const host = s.players.find((p) => p.id === s.hostId);
  if (host && !host.connected && host.disconnectedAt !== null && now >= host.disconnectedAt + HOST_GRACE_MS) {
    const next = nextHost(s, host.id);
    if (next && s.players.find((p) => p.id === next)?.connected) s.hostId = next;
  }
  maybeAdvanceOnPresence(s, now);
  if (s.deadlineAt === null || now < s.deadlineAt) return;
  switch (s.phase) {
    case 'DRAW':
      openPouch(s, 'A', now);
      openPouch(s, 'B', now);
      return;
    case 'IMAGINE':
      s.phase = 'NAMING';
      s.deadlineAt = now + NAMING_MS;
      return;
    case 'NAMING': {
      const draft = s.discovererId ? s.drafts[s.discovererId] : undefined;
      const [name, use] = parseNamingDraft(draft);
      finishNaming(s, { name: name || defaultName(s), use }, now);
      return;
    }
    case 'EXPLORE': {
      const ex = s.explore!;
      if (ex.step === 'PICK') beginAnswer(s, ex.offeredQuestionIds[0]!, now);
      else endRound(s, now);
      return;
    }
    case 'CONNECT':
      closeConnectStep(s, now);
      return;
    default:
      s.deadlineAt = null;
  }
}

/** 명명 초안은 클라이언트가 "이름\n쓰임" 형태로 자동 저장한다 */
function parseNamingDraft(draft: string | undefined): [string, string] {
  if (!draft) return ['', ''];
  const [name = '', ...rest] = draft.split('\n');
  return [clean(name, NAME_MAX), clean(rest.join(' '), USE_MAX)];
}

function defaultName(s: GameState): string {
  const obj = objectTokens.find((t) => t.id === s.objectId)?.label ?? '물건';
  const attr = attributeTokens.find((t) => t.id === s.attributeId)?.label ?? '';
  return clean(`${attr} ${obj}`, NAME_MAX);
}

function resetRound(s: GameState) {
  Object.assign(s, {
    startedAt: null,
    deadlineAt: null,
    extendUsed: false,
    discovererId: null,
    opened: { A: false, B: false },
    objectId: null,
    attributeId: null,
    rerollUsed: false,
    discovery: null,
    contributions: [],
    drafts: {},
    explore: null,
    connect: null,
    record: null,
    worldId: null,
  });
}

// --- 도우미 ------------------------------------------------------------------

function makeContribution(s: GameState, c: Omit<Contribution, 'id' | 'hidden'>): Contribution {
  return { ...c, id: `c${s.nextId++}`, hidden: false };
}

export function connectedPlayers(s: GameState): Player[] {
  return s.players.filter((p) => p.connected);
}

function requirePlayer(s: GameState, id: string): Player {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new GameError('이 방의 참여자가 아니에요.');
  return p;
}

function requireHost(s: GameState, id: string) {
  requirePlayer(s, id);
  if (s.hostId !== id) throw new GameError('방장만 할 수 있어요.');
}

function requireDiscovererOrHost(s: GameState, id: string) {
  requirePlayer(s, id);
  if (s.discovererId !== id && s.hostId !== id) throw new GameError('첫 발견자만 할 수 있어요.');
}

function requirePhase(s: GameState, ...phases: GameState['phase'][]) {
  if (!phases.includes(s.phase)) throw new GameError('지금 단계에서는 할 수 없어요.');
}

function clean(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

// mulberry32: 상태에 씨앗을 두어 같은 행동이면 같은 결과가 나오게 한다
function random(s: GameState): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pickFrom<T>(s: GameState, items: T[]): T {
  if (!items.length) throw new GameError('고를 수 있는 항목이 없어요.');
  return items[Math.floor(random(s) * items.length)]!;
}

function shuffle<T>(s: GameState, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
