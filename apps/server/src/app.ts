import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { GameError } from '@novapouch/game-core';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import { RoomManager, type ClientAction } from './rooms';
import { deviceKey, FileStore } from './store';

export interface AppOptions {
  dataDir: string;
  webDist?: string;
  logger?: boolean;
  clock?: () => number;
}

type Ack = (res: { ok: true; playerId?: string } | { ok: false; error: string }) => void;

const roomChannel = (code: string, playerId: string) => `${code}:${playerId}`;

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false });
  const store = new FileStore(opts.dataDir);
  const io = new Server(app.server, { cors: { origin: true }, pingInterval: 10_000, pingTimeout: 8_000 });

  const rooms = new RoomManager(
    store,
    {
      snapshot: (code, playerId, view) => io.to(roomChannel(code, playerId)).emit('snapshot', view),
      toast: (code, playerId, message) => io.to(roomChannel(code, playerId)).emit('toast', { message }),
    },
    opts.clock,
  );
  const sweeper = setInterval(() => rooms.sweep(), 10 * 60 * 1000);
  app.addHook('onClose', async () => {
    clearInterval(sweeper);
    rooms.close();
    io.close();
  });

  // --- REST -----------------------------------------------------------------

  app.get('/api/health', async () => ({ ok: true }));

  app.post('/api/rooms', async () => ({ code: rooms.create() }));

  app.get<{ Params: { code: string } }>('/api/rooms/:code', async (req, reply) => {
    const info = rooms.info(req.params.code);
    if (!info) return reply.code(404).send({ error: '방을 찾지 못했어요. 초대 코드를 확인해 주세요.' });
    return info;
  });

  const tokenOf = (headers: Record<string, unknown>) => {
    const t = headers['x-device-token'];
    return typeof t === 'string' && t.length >= 16 ? deviceKey(t) : null;
  };

  app.get('/api/worlds', async (req) => {
    const key = tokenOf(req.headers);
    if (!key) return { worlds: [] };
    return { worlds: store.worldsOf(key).map(({ memberKeys: _m, ...w }) => w) };
  });

  app.get<{ Params: { id: string } }>('/api/worlds/:id', async (req, reply) => {
    const w = store.getWorld(req.params.id);
    const key = tokenOf(req.headers);
    if (!w || (w.visibility !== 'link' && (!key || !w.memberKeys.includes(key)))) {
      return reply.code(404).send({ error: '세계를 찾지 못했어요. 참여자만 볼 수 있는 기록일 수 있어요.' });
    }
    const { memberKeys: _m, ...world } = w;
    return { world, isMember: Boolean(key && w.memberKeys.includes(key)) };
  });

  // --- 정적 파일 (운영 빌드) ------------------------------------------------------

  const dist = opts.webDist && resolve(opts.webDist);
  if (dist && existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/socket.io/')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  // --- 실시간 ---------------------------------------------------------------

  io.on('connection', (socket) => {
    let joined: { code: string; playerId: string } | null = null;

    const guard = (fn: () => void, ack?: Ack) => {
      try {
        fn();
        ack?.({ ok: true, playerId: joined?.playerId });
      } catch (err) {
        const message = err instanceof GameError ? err.message : '잠시 문제가 생겼어요. 다시 시도해 주세요.';
        if (!(err instanceof GameError)) app.log.error(err);
        ack?.({ ok: false, error: message });
      }
    };

    socket.on('join', (p: { code: string; deviceToken: string; nickname: string }, ack?: Ack) =>
      guard(() => {
        if (typeof p?.deviceToken !== 'string' || p.deviceToken.length < 16) throw new GameError('기기 정보를 확인하지 못했어요.');
        const code = String(p.code ?? '').toUpperCase();
        if (joined) void socket.leave(roomChannel(joined.code, joined.playerId));
        const { playerId } = rooms.join(code, p.deviceToken, String(p.nickname ?? ''));
        joined = { code, playerId };
        void socket.join(roomChannel(code, playerId));
        // 입장 때 보낸 상태는 채널에 들어오기 전이라 놓쳤을 수 있으니 이 소켓에 직접 보낸다
        socket.emit('snapshot', rooms.viewOf(code, playerId));
        rooms.announceBlocks(code, playerId);
      }, ack),
    );

    socket.on('act', (action: ClientAction, ack?: Ack) =>
      guard(() => {
        if (!joined) throw new GameError('먼저 방에 들어와 주세요.');
        rooms.act(joined.code, joined.playerId, action);
      }, ack),
    );

    socket.on('report', (r: { contributionId: string; reason: string; detail?: string; block?: boolean }, ack?: Ack) =>
      guard(() => {
        if (!joined) throw new GameError('먼저 방에 들어와 주세요.');
        rooms.report(joined.code, joined.playerId, r);
      }, ack),
    );

    socket.on('block', (p: { playerId: string }, ack?: Ack) =>
      guard(() => {
        if (!joined) throw new GameError('먼저 방에 들어와 주세요.');
        rooms.block(joined.code, joined.playerId, String(p?.playerId));
      }, ack),
    );

    socket.on('disconnect', async () => {
      if (!joined) return;
      const { code, playerId } = joined;
      // 같은 사람이 다른 탭으로 아직 연결돼 있으면 끊긴 것으로 보지 않는다
      const others = await io.in(roomChannel(code, playerId)).fetchSockets();
      if (others.length === 0) rooms.disconnect(code, playerId);
    });
  });

  return { app, io, rooms, store };
}
