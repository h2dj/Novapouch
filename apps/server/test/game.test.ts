import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GameView } from '@novapouch/game-core';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

type Ack = { ok: boolean; error?: string; playerId?: string };

let base = '';
let close: () => Promise<void>;
let dataDir = '';
const sockets: Socket[] = [];

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'novapouch-'));
  const { app } = await buildApp({ dataDir });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  close = () => app.close();
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
});

class Client {
  socket: Socket;
  view: GameView | null = null;
  toasts: string[] = [];
  private waiters: { pred: (v: GameView) => boolean; resolve: (v: GameView) => void }[] = [];

  constructor(public token: string, public nickname: string) {
    this.socket = connect(base, { transports: ['websocket'], forceNew: true });
    sockets.push(this.socket);
    this.socket.on('snapshot', (v: GameView) => {
      if (this.view && v.seq < this.view.seq) return;
      this.view = v;
      this.waiters = this.waiters.filter((w) => (w.pred(v) ? (w.resolve(v), false) : true));
    });
    this.socket.on('toast', (t: { message: string }) => this.toasts.push(t.message));
  }

  emit(event: string, payload: unknown): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }

  async join(code: string) {
    const ack = await this.emit('join', { code, deviceToken: this.token, nickname: this.nickname });
    expect(ack).toMatchObject({ ok: true });
    return ack;
  }

  async act(action: Record<string, unknown>) {
    const ack = await this.emit('act', action);
    if (!ack.ok) throw new Error(ack.error);
  }

  until(pred: (v: GameView) => boolean): Promise<GameView> {
    if (this.view && pred(this.view)) return Promise.resolve(this.view);
    return new Promise((resolve) => this.waiters.push({ pred, resolve }));
  }

  get me() {
    return this.view!.you;
  }
}

const newRoom = async () => (await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json()) as { code: string };
const token = (n: number) => `device-token-${n}-${'x'.repeat(16)}`;

describe('a whole game over sockets', () => {
  it('plays from lobby to a saved world', async () => {
    const { code } = await newRoom();
    expect(code).toMatch(/^[2-9A-Z]{4}$/);

    const a = new Client(token(1), '보민');
    const b = new Client(token(2), '은서');
    const c = new Client(token(3), '재현');
    await a.join(code);
    await b.join(code);
    await c.join(code);
    const all = [a, b, c];
    await a.until((v) => v.players.length === 3);
    expect(a.view!.hostId).toBe(a.me);

    await a.act({ type: 'UPDATE_SETTINGS', settings: { rounds: 3 } });
    await expect(b.act({ type: 'START' })).rejects.toThrow('방장만');
    await a.act({ type: 'START' });

    const draw = await a.until((v) => v.phase === 'DRAW');
    const disc = all.find((x) => x.me === draw.discovererId)!;
    await disc.act({ type: 'OPEN_POUCH', pouch: 'A' });
    await disc.act({ type: 'OPEN_POUCH', pouch: 'B' });
    await a.until((v) => v.phase === 'IMAGINE');
    // 5초 "잠시 상상하기"는 서버 타이머로 넘어간다
    await a.until((v) => v.phase === 'NAMING');
    await disc.act({ type: 'SUBMIT_DISCOVERY', name: '빗기억 거름우산', use: '하늘의 기억을 걸러 모은다' });

    for (let round = 1; round <= 3; round++) {
      const v = await a.until((x) => x.phase === 'EXPLORE' && x.explore!.round === round && x.explore!.step === 'PICK');
      const turn = all.find((x) => x.me === v.explore!.turnPlayerId)!;
      await turn.act({ type: 'PICK_QUESTION', questionId: v.explore!.offeredQuestionIds[1] });
      await a.until((x) => x.explore!.step === 'ANSWER' && x.explore!.round === round);
      await a.act({ type: 'SUBMIT_ANSWER', text: `보민의 ${round}번째 문장`, fromChoice: false });
      // 고요한 탐사: 다른 사람에게는 가려진다
      const seen = await b.until((x) => x.answeredIds.includes(a.me));
      expect(seen.contributions.find((x) => x.playerId === a.me && x.round === round)).toMatchObject({ text: null, masked: 'quiet' });
      await b.act({ type: 'SUBMIT_ANSWER', text: `은서의 ${round}번째 문장`, fromChoice: false });
      if (round === 2) {
        // 재현은 연결이 끊겼다가 돌아와도 초안이 남아 있다
        await c.act({ type: 'DRAFT', text: '돌아와서 마저 쓸 문장' });
        c.socket.disconnect();
        const back = new Client(token(3), '재현');
        await back.join(code);
        const restored = await back.until((x) => x.phase === 'EXPLORE');
        expect(restored.myDraft).toBe('돌아와서 마저 쓸 문장');
        expect(restored.you).toBe(c.me);
        all[2] = back;
        await back.act({ type: 'SUBMIT_ANSWER', text: '돌아와서 마저 쓸 문장', fromChoice: false });
      } else {
        await all[2]!.act({ type: 'SUBMIT_ANSWER', text: `재현의 ${round}번째 문장`, fromChoice: true });
      }
    }

    const con = await a.until((v) => v.phase === 'CONNECT');
    expect(con.candidateIds).toHaveLength(9);
    const target = con.contributions.find((x) => x.text === '은서의 1번째 문장')!;
    for (const x of all) await x.act({ type: 'VOTE', contributionIds: [target.id] });
    const afterPlace = await a.until((v) => v.connect?.stepIndex === 1);
    expect(afterPlace.connect!.confirmed.place).toEqual([target.id]);

    await b.act({ type: 'PROPOSE_FRAGMENT', text: '기억을 수선하는 우산 장인' });
    const withProposal = await a.until((v) => v.contributions.some((x) => x.phase === 'connect'));
    const resident = withProposal.contributions.find((x) => x.phase === 'connect')!;
    await a.act({ type: 'VOTE', contributionIds: [resident.id] });
    await a.act({ type: 'CLOSE_STEP' });
    await a.until((v) => v.connect?.stepIndex === 2);
    await a.act({ type: 'CLOSE_STEP' });
    await a.act({ type: 'CLOSE_STEP' });

    const rec = await a.until((v) => v.phase === 'RECORD');
    expect(rec.record!.proposals[0]!.text).toBe('빗기억 거름우산');
    await b.act({ type: 'GIVE_STAR', contributionId: con.contributions.find((x) => x.playerId === a.me)!.id, kind: 'surprise' });
    await a.act({ type: 'SET_VISIBILITY', visibility: 'members' });
    await a.act({ type: 'FINALIZE' });
    const done = await b.until((v) => v.phase === 'DONE');
    expect(done.worldId).toBeTruthy();

    const mine = (await fetch(`${base}/api/worlds`, { headers: { 'x-device-token': token(2) } }).then((r) => r.json())) as {
      worlds: { name: string; members: string[]; fragments: { type: string }[] }[];
    };
    expect(mine.worlds).toHaveLength(1);
    const world = mine.worlds[0]!;
    expect(world.name).toBe('빗기억 거름우산');
    expect(world.fragments.map((f) => f.type)).toEqual(['place', 'resident']);
    expect(world.members).toEqual(['보민', '은서', '재현']);

    const asMember = await fetch(`${base}/api/worlds/${done.worldId}`, { headers: { 'x-device-token': token(1) } });
    expect(asMember.status).toBe(200);
    const asStranger = await fetch(`${base}/api/worlds/${done.worldId}`, { headers: { 'x-device-token': token(9) } });
    expect(asStranger.status).toBe(404);
  }, 30_000);

  it('reports, blocks and hides', async () => {
    const { code } = await newRoom();
    const host = new Client(token(11), '방장');
    const bad = new Client(token(12), '도윤');
    const me = new Client(token(13), '하린');
    for (const x of [host, bad, me]) await x.join(code);
    await host.act({ type: 'UPDATE_SETTINGS', settings: { quietMode: false } });
    await host.act({ type: 'START' });
    await host.until((v) => v.phase === 'DRAW');
    const d = [host, bad, me].find((x) => x.me === host.view!.discovererId)!;
    await d.act({ type: 'OPEN_POUCH', pouch: 'A' });
    await d.act({ type: 'OPEN_POUCH', pouch: 'B' });
    await host.until((v) => v.phase === 'NAMING');
    await d.act({ type: 'SUBMIT_DISCOVERY', name: '물건', use: '' });
    await host.until((v) => v.phase === 'EXPLORE');
    await host.act({ type: 'PICK_QUESTION', questionId: host.view!.explore!.offeredQuestionIds[0] });
    await bad.act({ type: 'SUBMIT_ANSWER', text: '닥쳐 다들', fromChoice: false });

    const v = await me.until((x) => x.contributions.length === 1);
    const sentence = v.contributions[0]!;
    expect(sentence.flagged).toBe(true);
    await expect(bad.emit('report', { contributionId: sentence.id, reason: '모욕' })).resolves.toMatchObject({ ok: false });
    await me.emit('report', { contributionId: sentence.id, reason: '모욕하거나 괴롭히는 표현', block: true });
    const blockedView = await me.until((x) => x.blockedIds.includes(bad.me));
    expect(blockedView.contributions[0]).toMatchObject({ text: null, masked: 'blocked' });
    await host.until(() => host.toasts.some((t) => t.includes('신고')));

    await expect(me.act({ type: 'HIDE', contributionId: sentence.id, hidden: true })).rejects.toThrow('방장만');
    await host.act({ type: 'HIDE', contributionId: sentence.id, hidden: true });
    const hostView = await host.until((x) => x.contributions[0]!.hidden);
    expect(hostView.contributions[0]!.text).toBe('닥쳐 다들');

    // 다시 들어오면 차단 관계를 알려 준다
    me.socket.disconnect();
    const again = new Client(token(13), '하린');
    await again.join(code);
    await again.until(() => again.toasts.some((t) => t.includes('차단한 도윤')));
  }, 30_000);

  it('rejects unknown rooms and actions', async () => {
    const x = new Client(token(21), '누구');
    const ack = await x.emit('join', { code: 'ZZZZ', deviceToken: token(21), nickname: '누구' });
    expect(ack).toMatchObject({ ok: false, error: expect.stringContaining('방을 찾지') });
    const res = await fetch(`${base}/api/rooms/ZZZZ`);
    expect(res.status).toBe(404);
    const { code } = await newRoom();
    await x.join(code);
    await expect(x.act({ type: 'TICK', now: 0 })).rejects.toThrow('알 수 없는');
    await expect(x.act({ type: 'JOIN', playerId: 'evil' })).rejects.toThrow('알 수 없는');
  });
});

describe('metrics', () => {
  it('reads the logs written by a game', async () => {
    const { computeMetrics } = await import('../src/metrics');
    const { FileStore } = await import('../src/store');
    const m = computeMetrics(new FileStore(dataDir));
    expect(m.worlds).toBe(1);
    expect(m.games).toBeGreaterThanOrEqual(2);
    expect(m.completionRate).toBeGreaterThan(0);
    expect(m.reports).toBe(1);
    expect(m.hides).toBe(1);
    expect(m.flaggedAnswers).toBe(1);
  });
});
