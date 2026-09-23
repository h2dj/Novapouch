import { getQuestion, getToken } from '@novapouch/content';
import type { GameView } from '@novapouch/game-core';
import { useEffect, useRef, useState } from 'react';
import { useRoom } from './room';

/** 서버 기준 마감까지 남은 초. 1초마다 갱신한다 */
export function useRemaining(deadlineAt: number | null): number | null {
  const offset = useRoom((s) => s.offset);
  const [, tick] = useState(0);
  useEffect(() => {
    if (deadlineAt === null) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [deadlineAt]);
  if (deadlineAt === null) return null;
  return Math.max(0, Math.ceil((deadlineAt - (Date.now() + offset)) / 1000));
}

export function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useGameLabels(v: GameView) {
  const object = getToken(v.objectId ?? undefined);
  const attribute = getToken(v.attributeId ?? undefined);
  const question = getQuestion(v.explore?.questionId ?? undefined);
  const nick = (id: string | null | undefined) => v.players.find((p) => p.id === id)?.nickname ?? '떠난 탐사자';
  return { object, attribute, question, nick, isHost: v.hostId === v.you, me: v.players.find((p) => p.id === v.you) };
}

/** 입력 중인 글을 잠시 뒤 서버 초안으로 자동 저장한다 */
export function useDraftSaver(text: string, enabled: boolean, delay = 800) {
  const act = useRoom((s) => s.act);
  const [saved, setSaved] = useState(true);
  const last = useRef(text);
  useEffect(() => {
    if (!enabled || text === last.current) return;
    setSaved(false);
    const t = setTimeout(() => {
      last.current = text;
      void act({ type: 'DRAFT', text }).then((ok) => ok && setSaved(true));
    }, delay);
    return () => clearTimeout(t);
  }, [text, enabled, delay, act]);
  return saved;
}

const AVATAR_COLORS = ['var(--glow-teal)', 'var(--glow-violet)', 'var(--mist-blue)', 'var(--lavender)', 'var(--gold)', 'var(--rose)'];

export function avatarColor(v: GameView | null, playerId: string): string {
  const order = v ? [...v.players].sort((a, b) => a.joinedAt - b.joinedAt).findIndex((p) => p.id === playerId) : 0;
  return AVATAR_COLORS[Math.max(0, order) % AVATAR_COLORS.length]!;
}
