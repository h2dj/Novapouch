import type { GameView } from '@novapouch/game-core';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { accessCode, useConfig } from './config';
import { deviceToken, nickname as savedNickname } from './storage';

type Ack = { ok: true; playerId?: string } | { ok: false; error: string };

export type ClientAction = { type: string } & Record<string, unknown>;

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

interface RoomStore {
  code: string | null;
  status: 'idle' | 'joining' | 'joined' | 'error';
  error: string | null;
  online: boolean;
  view: GameView | null;
  /** 서버 시계 - 내 시계. 남은 시간 표시에 쓴다 */
  offset: number;
  toasts: Toast[];
  enter: (code: string, nickname: string) => Promise<boolean>;
  exit: () => void;
  act: (action: ClientAction) => Promise<boolean>;
  report: (r: { contributionId: string; reason: string; detail?: string; block: boolean }) => Promise<boolean>;
  block: (playerId: string) => Promise<boolean>;
  toast: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

let socket: Socket | null = null;
let toastId = 0;

function getSocket(): Socket {
  if (socket) return socket;
  socket = io({
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 4000,
    // 연결할 때마다 저장된 접근 코드를 다시 읽는다
    auth: (cb) => cb({ accessCode: accessCode() }),
  });
  socket.on('connect_error', (err) => {
    if (err.message.includes('접근 코드')) void useConfig.getState().refresh();
  });
  socket.on('snapshot', (view: GameView) => {
    const { view: prev } = useRoom.getState();
    if (prev && prev.code === view.code && view.seq < prev.seq) return;
    useRoom.setState({ view, offset: view.serverTime - Date.now() });
  });
  socket.on('toast', (t: { message: string }) => useRoom.getState().toast(t.message));
  socket.on('disconnect', () => useRoom.setState({ online: false }));
  socket.on('connect', () => {
    useRoom.setState({ online: true });
    const { code, status } = useRoom.getState();
    // 연결이 끊겼다 돌아오면 같은 기기 토큰으로 다시 들어가 상태를 복원한다
    if (code && status === 'joined') void emit('join', { code, deviceToken: deviceToken(), nickname: savedNickname.get() });
  });
  return socket;
}

function emit(event: string, payload: unknown): Promise<Ack> {
  const s = getSocket();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: '연결이 불안정해요. 잠시 후 다시 시도해 주세요.' }), 8000);
    s.emit(event, payload, (ack: Ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

export const useRoom = create<RoomStore>((set, get) => ({
  code: null,
  status: 'idle',
  error: null,
  online: true,
  view: null,
  offset: 0,
  toasts: [],

  enter: async (code, nickname) => {
    savedNickname.set(nickname);
    set({ code, status: 'joining', error: null, view: get().view?.code === code ? get().view : null });
    const ack = await emit('join', { code, deviceToken: deviceToken(), nickname });
    if (!ack.ok) {
      set({ status: 'error', error: ack.error });
      return false;
    }
    set({ status: 'joined' });
    return true;
  },

  exit: () => {
    if (get().status === 'joined') void emit('act', { type: 'LEAVE' });
    set({ code: null, status: 'idle', view: null, error: null });
  },

  act: async (action) => {
    const ack = await emit('act', action);
    if (!ack.ok) get().toast(ack.error, 'error');
    return ack.ok;
  },

  report: async (r) => {
    const ack = await emit('report', r);
    if (!ack.ok) get().toast(ack.error, 'error');
    else get().toast(r.block ? '신고하고 차단했어요. 이제 그 사람의 문장은 가려져요.' : '신고를 보냈어요. 알려 주셔서 고마워요.');
    return ack.ok;
  },

  block: async (playerId) => {
    const ack = await emit('block', { playerId });
    if (!ack.ok) get().toast(ack.error, 'error');
    else get().toast('차단했어요. 내 화면에서 그 사람의 문장이 가려져요.');
    return ack.ok;
  },

  toast: (message, tone = 'info') => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, message, tone }].slice(-3) });
    setTimeout(() => get().dismiss(id), tone === 'error' ? 5000 : 6000);
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
}
