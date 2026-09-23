import type { WorldRecord } from '@novapouch/game-core';
import { accessCode } from './config';
import { deviceToken } from './storage';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'x-device-token': deviceToken(), 'x-access-code': accessCode(), ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? '서버와 연결하지 못했어요.');
  return body as T;
}

export const api = {
  createRoom: () => request<{ code: string }>('/api/rooms', { method: 'POST' }),
  room: (code: string) =>
    request<{ code: string; phase: string; players: number; joinable: boolean }>(`/api/rooms/${encodeURIComponent(code)}`),
  worlds: () => request<{ worlds: WorldRecord[] }>('/api/worlds'),
  world: (id: string) => request<{ world: WorldRecord; isMember: boolean }>(`/api/worlds/${encodeURIComponent(id)}`),
};
