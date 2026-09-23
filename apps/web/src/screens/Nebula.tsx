import { getToken } from '@novapouch/content';
import type { WorldRecord } from '@novapouch/game-core';
import { useEffect, useMemo, useState } from 'react';
import { TopBar } from '../components/bits';
import { attributeColor, hash, Planet } from '../components/Planet';
import { api } from '../lib/api';
import { navigate } from '../lib/router';

interface Placed {
  world: WorldRecord;
  x: number;
  y: number;
  r: number;
  color: string;
}

/** 가까운 별은 같은 사물 토큰, 같은 빛은 같은 속성 토큰을 공유한다 */
function layout(worlds: WorldRecord[], compact: boolean): Placed[] {
  // 좁은 화면은 세로로 긴 지도에 크게 그린다
  const [mapW, mapH, sx, sy, scale] = compact ? [1000, 1300, 1.2, 1.9, 2] : [1000, 600, 1.5, 0.85, 1];
  const groups = new Map<string, WorldRecord[]>();
  for (const w of worlds) groups.set(w.objectId, [...(groups.get(w.objectId) ?? []), w]);
  const placed: Placed[] = [];
  [...groups.entries()].forEach(([objectId, list], gi) => {
    const h = hash(objectId);
    const angle = (h % 360) * (Math.PI / 180) + gi * 2.4;
    const dist = 90 + ((h >>> 9) % 170);
    const cx = mapW / 2 + Math.cos(angle) * dist * sx;
    const cy = mapH / 2 + Math.sin(angle) * dist * sy;
    list.forEach((world, i) => {
      const a = i * 2.1 + (h % 7);
      const d = i === 0 ? 0 : (34 + i * 6) * scale;
      placed.push({
        world,
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
        r: (14 + Math.min(10, world.timeline.length)) * scale,
        color: attributeColor(world.attributeId),
      });
    });
  });
  return placed;
}

export function Nebula() {
  const [worlds, setWorlds] = useState<WorldRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .worlds()
      .then((r) => setWorlds(r.worlds))
      .catch((e: Error) => setError(e.message));
  }, []);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setCompact(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const placed = useMemo(() => layout(worlds ?? [], compact), [worlds, compact]);
  const links = useMemo(
    () =>
      placed.flatMap((a, i) =>
        placed.slice(i + 1).filter((b) => b.world.objectId === a.world.objectId || b.world.attributeId === a.world.attributeId).map((b) => [a, b] as const),
      ),
    [placed],
  );

  return (
    <div className="nebula">
      <div className="nebula__bg" aria-hidden="true" />
      <div className="page">
        <TopBar crumb="성운 기록" onBack={() => navigate('/')} />
        <main className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
          <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
            <span className="eyebrow">NEBULA</span>
            <h1 className="display">
              함께 만든 세계가
              <br />
              서로의 기억 속에서 이어집니다
            </h1>
            <div className="row wrap caption" style={{ columnGap: 16, rowGap: 0 }}>
              <span>가까운 별 · 같은 사물 토큰을 공유한 세계</span>
              <span>같은 빛 · 같은 속성 토큰을 공유한 세계</span>
            </div>
          </div>

          {error ? <p className="banner">{error}</p> : null}
          {worlds === null && !error ? <p className="caption">성운을 불러오는 중이에요…</p> : null}
          {worlds && worlds.length === 0 ? (
            <div className="card card--quiet stack" style={{ alignItems: 'flex-start' }}>
              <p>아직 이 기기에서 저장한 세계가 없어요.</p>
              <p className="caption">한 판을 끝까지 마치면 완성된 세계가 별처럼 여기에 남아요.</p>
              <button type="button" className="btn btn--accent" onClick={() => navigate('/')}>
                새 세계 발견하러 가기
              </button>
            </div>
          ) : null}

          {worlds && worlds.length > 0 ? (
            <>
              <svg className="nebula__map" viewBox={compact ? '0 0 1000 1300' : '0 0 1000 600'} role="group" aria-label="성운 지도">
                {links.map(([a, b], i) => (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={a.world.objectId === b.world.objectId ? '#E6C890' : a.color}
                    strokeOpacity="0.4"
                    strokeDasharray={a.world.objectId === b.world.objectId ? undefined : '3 6'}
                  />
                ))}
                {placed.map((p) => (
                  <a
                    key={p.world.id}
                    href={`/w/${p.world.id}`}
                    aria-label={`${p.world.name}, ${getToken(p.world.objectId)?.label} + ${getToken(p.world.attributeId)?.label}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/w/${p.world.id}`);
                    }}
                    className="nebula__star"
                  >
                    <circle cx={p.x} cy={p.y} r={p.r * 2.2} fill={p.color} opacity="0.12" />
                    <circle cx={p.x} cy={p.y} r={p.r} fill="#18263D" stroke={p.color} strokeWidth="1.5" />
                    <circle cx={p.x - p.r * 0.3} cy={p.y - p.r * 0.3} r={p.r * 0.35} fill={p.color} opacity="0.6" />
                    <text x={p.x} y={p.y + p.r + (compact ? 44 : 20)} textAnchor="middle" fontSize={compact ? 38 : 15} fill="#E9EEF6">
                      {p.world.name}
                    </text>
                  </a>
                ))}
              </svg>

              <ul className="nebula__list">
                {worlds.map((w) => (
                  <li key={w.id}>
                    <a
                      href={`/w/${w.id}`}
                      className="card row"
                      style={{ textDecoration: 'none', color: 'inherit' }}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/w/${w.id}`);
                      }}
                    >
                      <Planet objectId={w.objectId} attributeId={w.attributeId} size={56} />
                      <span className="stack grow" style={{ '--gap': '2px' } as React.CSSProperties}>
                        <span style={{ fontWeight: 700 }}>{w.name}</span>
                        <span className="caption">
                          {w.serial} · {getToken(w.attributeId)?.label} {getToken(w.objectId)?.label}
                        </span>
                        <span className="caption">
                          {w.members.join(', ')} · {new Date(w.createdAt).toLocaleDateString('ko-KR')}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
