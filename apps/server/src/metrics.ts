/**
 * 운영 테스트 지표 (docs/DEVELOPMENT_PLAN.md §11)
 *   pnpm --filter @novapouch/server metrics
 */
import { resolve } from 'node:path';
import { gini } from '@novapouch/game-core';
import { FileStore, type StoredWorld } from './store';

const DAY = 24 * 60 * 60 * 1000;

export function computeMetrics(store: FileStore) {
  const events = store.events();
  const worlds = store.allWorlds();
  const games = new Set(events.filter((e) => e.type === 'START').map((e) => `${e.roomCode}#${e.gameNo}`));
  const finished = events.filter((e) => e.type === 'FINALIZE');
  const durations = finished.map((e) => Number(e.data?.durationMs)).filter((n) => Number.isFinite(n));

  const balance = worlds.map((w) => {
    const chars = new Map<string, number>();
    for (const m of w.members) chars.set(m, 0);
    for (const e of w.timeline) if (e.phase === 'explore') chars.set(e.nickname, (chars.get(e.nickname) ?? 0) + e.text.length);
    return gini([...chars.values()]);
  });

  // 연결 행동(대략): 앞 라운드 다른 사람 문장의 두 글자 이상 낱말을 이어 쓴 문장 비율
  let echo = 0;
  let explore = 0;
  for (const w of worlds) {
    const entries = w.timeline.filter((e) => e.phase === 'explore');
    for (const e of entries) {
      if (!e.round || e.round === 1) continue;
      explore += 1;
      const prevWords = new Set(
        entries.filter((p) => p.round === e.round! - 1 && p.nickname !== e.nickname).flatMap((p) => p.text.split(/\s+/)).filter((x) => x.length >= 2),
      );
      if (e.text.split(/\s+/).some((x) => prevWords.has(x))) echo += 1;
    }
  }

  const answers = events.filter((e) => e.type === 'SUBMIT_ANSWER');
  const revisit = revisitRate(worlds);

  return {
    games: games.size,
    worlds: worlds.length,
    completionRate: games.size ? worlds.length / games.size : null,
    medianMinutes: durations.length ? median(durations) / 60000 : null,
    contributionGini: balance.length ? balance.reduce((a, b) => a + b, 0) / balance.length : null,
    echoRate: explore ? echo / explore : null,
    choiceRate: answers.length ? answers.filter((e) => e.data?.fromChoice).length / answers.length : null,
    flaggedAnswers: answers.filter((e) => e.data?.flagged).length,
    reports: store.reports().length,
    hides: events.filter((e) => e.type === 'HIDE' && e.data?.hidden).length,
    revisitRate14d: revisit,
  };
}

/** 같은 팀(참여 기기 절반 이상 겹침)이 14일 안에 다른 조합으로 다시 저장한 비율 */
function revisitRate(worlds: StoredWorld[]): number | null {
  if (!worlds.length) return null;
  const sorted = [...worlds].sort((a, b) => a.createdAt - b.createdAt);
  let again = 0;
  for (const [i, w] of sorted.entries()) {
    const later = sorted.slice(i + 1).find((x) => {
      if (x.createdAt - w.createdAt > 14 * DAY || (x.objectId === w.objectId && x.attributeId === w.attributeId)) return false;
      const overlap = x.memberKeys.filter((k) => w.memberKeys.includes(k)).length;
      return overlap / Math.max(1, w.memberKeys.length) >= 0.5;
    });
    if (later) again += 1;
  }
  return again / sorted.length;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.env.DATA_DIR ?? resolve(process.cwd(), '../../.data');
  const m = computeMetrics(new FileStore(dir));
  const pct = (v: number | null) => (v === null ? '-' : `${(v * 100).toFixed(0)}%`);
  console.log(`데이터: ${dir}`);
  console.log(`시작한 게임 ${m.games} · 저장된 세계 ${m.worlds} · 완주율 ${pct(m.completionRate)}`);
  console.log(`한 판 중앙값 ${m.medianMinutes?.toFixed(1) ?? '-'}분 (목표 15분)`);
  console.log(`기여 균형(지니, 0에 가까울수록 고름) ${m.contributionGini?.toFixed(2) ?? '-'}`);
  console.log(`연결 행동 ${pct(m.echoRate)} · 선택지로 답한 비율 ${pct(m.choiceRate)}`);
  console.log(`14일 재방문 ${pct(m.revisitRate14d)}`);
  console.log(`금칙어 표시 ${m.flaggedAnswers} · 신고 ${m.reports} · 방장 숨김 ${m.hides}`);
}
