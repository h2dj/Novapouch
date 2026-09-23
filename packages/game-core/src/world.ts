import { getToken } from '@novapouch/content';
import { CONNECT_STEPS } from './rules';
import type { FragmentType, GameState, StarKind, Visibility } from './types';

export interface WorldFragment {
  type: FragmentType;
  contributionId: string;
  text: string;
  nickname: string;
}

export interface WorldEntry {
  id: string;
  nickname: string;
  phase: 'discovery' | 'explore' | 'connect';
  round: number | null;
  questionId: string | null;
  fragmentType: FragmentType | null;
  text: string;
  fromChoice: boolean;
  at: number;
  stars: Partial<Record<StarKind, number>>;
}

/** 성운에 저장되는 완성된 세계. 참여자의 문장과 선택 경로를 그대로 남긴다 */
export interface WorldRecord {
  id: string;
  serial: string;
  name: string;
  objectId: string;
  attributeId: string;
  discovery: { name: string; use: string; nickname: string };
  fragments: WorldFragment[];
  timeline: WorldEntry[];
  members: string[];
  visibility: Visibility;
  roomCode: string;
  createdAt: number;
}

/** RECORD 단계의 표를 세어 세계 이름을 정한다. 동률이면 방장의 선택, 그다음 먼저 나온 이름 */
export function chooseWorldName(s: GameState): string {
  const rec = s.record;
  if (!rec || !rec.proposals.length) return s.discovery?.name ?? '이름 없는 세계';
  const count = new Map<string, number>();
  for (const id of Object.values(rec.votes)) count.set(id, (count.get(id) ?? 0) + 1);
  const hostVote = s.hostId ? rec.votes[s.hostId] : undefined;
  const best = [...rec.proposals].sort(
    (a, b) =>
      (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) ||
      Number(b.id === hostVote) - Number(a.id === hostVote),
  )[0]!;
  return best.text;
}

export function buildWorld(s: GameState, meta: { id: string; serialNo: number; now: number }): WorldRecord {
  const nick = (id: string) => s.players.find((p) => p.id === id)?.nickname ?? '떠난 탐사자';
  const obj = getToken(s.objectId ?? undefined);
  const visible = s.contributions.filter((c) => !c.hidden);
  const byId = new Map(visible.map((c) => [c.id, c]));
  const stars = s.record?.stars ?? [];

  const fragments: WorldFragment[] = [];
  for (const step of CONNECT_STEPS) {
    for (const id of s.connect?.confirmed[step.type] ?? []) {
      const c = byId.get(id);
      if (c) fragments.push({ type: step.type, contributionId: c.id, text: c.text, nickname: nick(c.playerId) });
    }
  }

  const discoveryNick = nick(s.discovererId ?? '');
  const timeline: WorldEntry[] = [
    {
      id: 'discovery',
      nickname: discoveryNick,
      phase: 'discovery',
      round: null,
      questionId: null,
      fragmentType: null,
      text: `${s.discovery?.name ?? ''}${s.discovery?.use ? ` — ${s.discovery.use}` : ''}`,
      fromChoice: false,
      at: s.startedAt ?? meta.now,
      stars: {},
    },
    ...visible.map((c) => ({
      id: c.id,
      nickname: nick(c.playerId),
      phase: c.phase,
      round: c.round,
      questionId: c.questionId,
      fragmentType: c.fragmentType,
      text: c.text,
      fromChoice: c.fromChoice,
      at: c.at,
      stars: stars
        .filter((x) => x.contributionId === c.id)
        .reduce<Partial<Record<StarKind, number>>>((acc, x) => ({ ...acc, [x.kind]: (acc[x.kind] ?? 0) + 1 }), {}),
    })),
  ];

  return {
    id: meta.id,
    serial: `${obj?.code ?? 'WORLD'} ${String(meta.serialNo).padStart(3, '0')}`,
    name: chooseWorldName(s),
    objectId: s.objectId ?? '',
    attributeId: s.attributeId ?? '',
    discovery: { name: s.discovery?.name ?? '', use: s.discovery?.use ?? '', nickname: discoveryNick },
    fragments,
    timeline,
    members: s.players.map((p) => p.nickname),
    visibility: s.record?.visibility ?? 'members',
    roomCode: s.code,
    createdAt: meta.now,
  };
}
