import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
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
  /** 화면에 보일 서비스 이름. 외부 공개 때는 가칭을 넣는다 */
  brand?: string;
  /** 설정하면 이 코드를 아는 사람만 들어올 수 있다 (내부 테스트용) */
  accessCode?: string;
  /** 프록시 뒤에서 실제 접속 주소를 읽는다 (Fly.io 등) */
  trustProxy?: boolean;
}

export const DEFAULT_BRAND = 'NOVA POUCH';

/** 소켓 하나가 짧은 시간에 보낼 수 있는 이벤트 수 */
const SOCKET_BURST = 40;
const SOCKET_WINDOW_MS = 10_000;

function sameSecret(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Ack = (res: { ok: true; playerId?: string } | { ok: false; error: string }) => void;

const roomChannel = (code: string, playerId: string) => `${code}:${playerId}`;

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: opts.trustProxy ?? false });
  const store = new FileStore(opts.dataDir);
  const brand = opts.brand?.trim() || DEFAULT_BRAND;
  const accessCode = opts.accessCode?.trim() || null;
  // 화면과 서버가 같은 주소에서 나가므로 다른 출처의 소켓 연결은 받지 않는다
  const io = new Server(app.server, { pingInterval: 10_000, pingTimeout: 8_000, maxHttpBufferSize: 16_000 });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  // 내부 테스트 단계에서는 검색에 노출하지 않는다
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-robots-tag', 'noindex, nofollow');
  });
  await app.register(rateLimit, { global: false });

  const allowed = (headers: Record<string, unknown>) => !accessCode || sameSecret(headers['x-access-code'], accessCode);

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

  // 서버가 다시 시작되면 진행 중인 게임이 사라지므로 배포 전에 activeGames를 확인한다
  app.get('/api/health', async () => ({ ok: true, activeGames: rooms.activeGames() }));

  app.get('/api/config', async (req) => ({ brand, accessRequired: Boolean(accessCode), accessOk: allowed(req.headers) }));

  app.get('/robots.txt', async (_req, reply) => reply.type('text/plain').send('User-agent: *\nDisallow: /\n'));

  // 접근 코드가 필요한 API는 코드가 맞을 때만 연다
  app.addHook('onRequest', async (req, reply) => {
    const open = ['/api/health', '/api/config'];
    if (req.url.startsWith('/api/') && !open.includes(req.url.split('?')[0]!) && !allowed(req.headers)) {
      return reply.code(401).send({ error: '접근 코드를 확인해 주세요.' });
    }
  });

  app.post('/api/rooms', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async () => ({ code: rooms.create() }));

  app.get<{ Params: { code: string } }>('/api/rooms/:code', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
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

  io.use((socket, next) => {
    if (!accessCode || sameSecret(socket.handshake.auth?.accessCode, accessCode)) return next();
    next(new Error('접근 코드를 확인해 주세요.'));
  });

  io.on('connection', (socket) => {
    let joined: { code: string; playerId: string } | null = null;
    let windowStart = Date.now();
    let count = 0;

    const guard = (fn: () => void, ack?: Ack) => {
      const t = Date.now();
      if (t - windowStart > SOCKET_WINDOW_MS) {
        windowStart = t;
        count = 0;
      }
      if (++count > SOCKET_BURST) {
        ack?.({ ok: false, error: '너무 빠르게 보내고 있어요. 잠시 후 다시 시도해 주세요.' });
        return;
      }
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

  return { app, io, rooms, store, brand };
}
