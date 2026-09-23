import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { findBlockedWords } from '@novapouch/content';
import {
  buildWorld,
  createGame,
  GameError,
  nextWakeAt,
  reduce,
  viewFor,
  type Action,
  type GameState,
  type GameView,
} from '@novapouch/game-core';
import { deviceKey, type FileStore } from './store';

/** 헷갈리는 글자(0/O, 1/I/L)를 뺀 방 코드 문자 */
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ROOM_IDLE_MS = 6 * 60 * 60 * 1000;

interface Room {
  state: GameState;
  timer: NodeJS.Timeout | null;
  /** 기기 키 → 방 안의 플레이어 id */
  players: Map<string, string>;
  lastActiveAt: number;
}

export type ClientAction =
  | Exclude<Action, { type: 'JOIN' | 'CONNECTION' | 'TICK' | 'FINALIZE' | 'SUBMIT_ANSWER' | 'PROPOSE_FRAGMENT' }>
  | { type: 'FINALIZE' }
  | { type: 'SUBMIT_ANSWER'; text: string; fromChoice: boolean }
  | { type: 'PROPOSE_FRAGMENT'; text: string };

const CLIENT_TYPES = new Set([
  'LEAVE',
  'UPDATE_SETTINGS',
  'START',
  'OPEN_POUCH',
  'REROLL',
  'DRAFT',
  'EXTEND',
  'SUBMIT_DISCOVERY',
  'PICK_QUESTION',
  'SUBMIT_ANSWER',
  'PROPOSE_FRAGMENT',
  'VOTE',
  'CLOSE_STEP',
  'PROPOSE_NAME',
  'VOTE_NAME',
  'SET_VISIBILITY',
  'GIVE_STAR',
  'FINALIZE',
  'RESTART',
  'HIDE',
]);

export interface Listener {
  /** 한 플레이어에게 새 상태를 보낸다 */
  snapshot(code: string, playerId: string, view: GameView): void;
  toast(code: string, playerId: string, message: string): void;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(
    private store: FileStore,
    private listener: Listener,
    private clock: () => number = Date.now,
  ) {}

  create(): string {
    let code = '';
    do code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    while (this.rooms.has(code));
    this.rooms.set(code, {
      state: createGame(code, randomBytes(4).readUInt32LE()),
      timer: null,
      players: new Map(),
      lastActiveAt: this.clock(),
    });
    return code;
  }

  info(code: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return null;
    const s = room.state;
    return { code: s.code, phase: s.phase, players: s.players.length, joinable: s.phase === 'LOBBY' || s.phase === 'DONE' };
  }

  /** 입장 또는 재입장. 같은 기기는 같은 플레이어로 복원한다 */
  join(code: string, token: string, nickname: string): { playerId: string } {
    const room = this.requireRoom(code);
    const key = deviceKey(token);
    const playerId = room.players.get(key) ?? randomUUID().slice(0, 8);
    this.apply(room, { type: 'JOIN', playerId, nickname, now: this.clock() }, key);
    room.players.set(key, playerId);
    return { playerId };
  }

  disconnect(code: string, playerId: string) {
    const room = this.rooms.get(code);
    if (!room || !room.state.players.some((p) => p.id === playerId)) return;
    this.apply(room, { type: 'CONNECTION', playerId, connected: false, now: this.clock() }, null);
  }

  act(code: string, playerId: string, input: ClientAction) {
    const room = this.requireRoom(code);
    if (!input || typeof input !== 'object' || !CLIENT_TYPES.has(input.type)) throw new GameError('알 수 없는 행동이에요.');
    const now = this.clock();
    const key = this.keyOf(room, playerId);
    let action: Action;
    switch (input.type) {
      case 'FINALIZE': {
        const objectId = room.state.objectId ?? '';
        action = { type: 'FINALIZE', playerId, worldId: randomUUID(), now };
        const next = reduce(room.state, action);
        const world = buildWorld(next, { id: action.worldId, serialNo: this.store.nextSerial(objectId), now });
        this.store.saveWorld({ ...world, memberKeys: [...room.players.entries()].filter(([, id]) => next.players.some((p) => p.id === id)).map(([k]) => k) });
        this.commit(room, next, action, key);
        return;
      }
      case 'SUBMIT_ANSWER':
        action = {
          type: 'SUBMIT_ANSWER',
          playerId,
          text: String(input.text ?? ''),
          fromChoice: Boolean(input.fromChoice),
          flagged: findBlockedWords(String(input.text ?? '')).length > 0,
          now,
        };
        break;
      case 'PROPOSE_FRAGMENT':
        action = { type: 'PROPOSE_FRAGMENT', playerId, text: String(input.text ?? ''), flagged: findBlockedWords(String(input.text ?? '')).length > 0, now };
        break;
      default:
        action = { ...input, playerId, now } as Action;
    }
    this.apply(room, action, key);
  }

  report(code: string, playerId: string, r: { contributionId: string; reason: string; detail?: string; block?: boolean }) {
    const room = this.requireRoom(code);
    const c = room.state.contributions.find((x) => x.id === r.contributionId);
    if (!c) throw new GameError('신고할 문장을 찾지 못했어요.');
    if (c.playerId === playerId) throw new GameError('내 문장은 신고할 수 없어요.');
    const reporterKey = this.keyOf(room, playerId)!;
    const targetKey = this.keyOf(room, c.playerId);
    this.store.addReport({
      at: this.clock(),
      roomCode: room.state.code,
      contributionId: c.id,
      text: c.text,
      targetKey,
      reporterKey,
      reason: String(r.reason).slice(0, 40),
      detail: String(r.detail ?? '').slice(0, 300),
    });
    if (r.block) this.block(code, playerId, c.playerId);
    const host = room.state.hostId;
    const target = room.state.players.find((p) => p.id === c.playerId)?.nickname ?? '누군가';
    if (host && host !== playerId) {
      this.listener.toast(room.state.code, host, `${target} 님의 문장이 신고됐어요. 문장을 눌러 숨길지 정해 주세요.`);
    }
  }

  block(code: string, playerId: string, targetId: string) {
    const room = this.requireRoom(code);
    const me = this.keyOf(room, playerId);
    const target = this.keyOf(room, targetId);
    if (!me || !target || me === target) throw new GameError('차단할 수 없는 사람이에요.');
    this.store.addBlock(me, target);
    this.broadcast(room);
  }

  /** 오래 비어 있던 방을 정리한다 */
  sweep() {
    const now = this.clock();
    for (const [code, room] of this.rooms) {
      if (!room.state.players.some((p) => p.connected) && now - room.lastActiveAt > ROOM_IDLE_MS) {
        if (room.timer) clearTimeout(room.timer);
        this.rooms.delete(code);
      }
    }
  }

  /** 누군가 접속해 있고 진행 중인 게임 수. 배포 전에 확인한다 */
  activeGames(): number {
    let n = 0;
    for (const room of this.rooms.values()) {
      const s = room.state;
      if (s.phase !== 'LOBBY' && s.phase !== 'DONE' && s.players.some((p) => p.connected)) n += 1;
    }
    return n;
  }

  state(code: string): GameState | undefined {
    return this.rooms.get(code)?.state;
  }

  close() {
    for (const room of this.rooms.values()) if (room.timer) clearTimeout(room.timer);
  }

  // -------------------------------------------------------------------------

  private requireRoom(code: string): Room {
    const room = this.rooms.get(String(code).toUpperCase());
    if (!room) throw new GameError('방을 찾지 못했어요. 초대 코드를 확인해 주세요.');
    return room;
  }

  private keyOf(room: Room, playerId: string): string | null {
    for (const [k, id] of room.players) if (id === playerId) return k;
    return null;
  }

  private apply(room: Room, action: Action, key: string | null) {
    this.commit(room, reduce(room.state, action), action, key);
  }

  private commit(room: Room, next: GameState, action: Action, key: string | null) {
    const prev = room.state;
    room.state = next;
    room.lastActiveAt = this.clock();
    if (action.type !== 'DRAFT' && action.type !== 'TICK') {
      this.store.logEvent({
        at: this.clock(),
        roomCode: next.code,
        gameNo: next.gameNo,
        type: action.type,
        playerKey: key,
        data: logData(action, next),
      });
    } else if (action.type === 'TICK' && prev.phase !== next.phase) {
      this.store.logEvent({ at: this.clock(), roomCode: next.code, gameNo: next.gameNo, type: `TIMEOUT_${prev.phase}`, playerKey: null });
    }
    this.schedule(room);
    // 초안 저장은 본인 화면에만 영향을 주므로 방 전체에 다시 보내지 않는다
    if (action.type !== 'DRAFT') this.broadcast(room);
  }

  private schedule(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const at = nextWakeAt(room.state, this.clock());
    if (at === null) return;
    room.timer = setTimeout(() => {
      room.timer = null;
      try {
        this.apply(room, { type: 'TICK', now: this.clock() }, null);
      } catch (err) {
        console.error('tick failed', err);
      }
    }, Math.max(0, at - this.clock()) + 20);
  }

  viewOf(code: string, playerId: string): GameView {
    const room = this.requireRoom(code);
    return this.viewIn(room, this.keyOf(room, playerId) ?? '', playerId);
  }

  private viewIn(room: Room, key: string, playerId: string): GameView {
    const blocked = this.store.blockedBy(key);
    const blockedIds = [...room.players.entries()].filter(([k]) => blocked.has(k)).map(([, id]) => id);
    return viewFor(room.state, playerId, { now: this.clock(), blockedIds });
  }

  private broadcast(room: Room) {
    for (const [key, playerId] of room.players) {
      if (!room.state.players.some((p) => p.id === playerId)) continue;
      this.listener.snapshot(room.state.code, playerId, this.viewIn(room, key, playerId));
    }
  }

  /** 차단 관계인 사람과 같은 방에 들어오면 양쪽에 알린다. 입장한 소켓이 채널에 들어간 뒤 부른다 */
  announceBlocks(code: string, playerId: string) {
    const room = this.requireRoom(code);
    const key = this.keyOf(room, playerId);
    if (key) this.warnAboutBlocks(room, key, playerId);
  }

  private warnAboutBlocks(room: Room, key: string, playerId: string) {
    const mine = this.store.blockedBy(key);
    for (const [otherKey, otherId] of room.players) {
      if (otherKey === key) continue;
      const nick = room.state.players.find((p) => p.id === otherId)?.nickname;
      if (!nick) continue;
      if (mine.has(otherKey)) this.listener.toast(room.state.code, playerId, `차단한 ${nick} 님이 이 방에 있어요. 그 사람의 문장은 가려져요.`);
      if (this.store.blockedBy(otherKey).has(key)) {
        this.listener.toast(room.state.code, otherId, `차단한 사람이 이 방에 들어왔어요. 그 사람의 문장은 가려져요.`);
      }
    }
  }
}

function logData(action: Action, s: GameState): Record<string, unknown> | undefined {
  switch (action.type) {
    case 'START':
      return { players: s.players.length, settings: s.settings };
    case 'SUBMIT_ANSWER':
      return { length: action.text.length, fromChoice: action.fromChoice, flagged: action.flagged, round: s.explore?.round };
    case 'FINALIZE':
      return { worldId: action.worldId, durationMs: s.startedAt ? action.now - s.startedAt : null, visibility: s.record?.visibility };
    case 'HIDE':
      return { hidden: action.hidden };
    default:
      return undefined;
  }
}
