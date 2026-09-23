import { getToken } from '@novapouch/content';
import { fragmentLabels, type FragmentType, type StarKind, type WorldRecord } from '@novapouch/game-core';
import { forwardRef } from 'react';
import { Planet } from './Planet';

export const STAR_LABELS: Record<StarKind, string> = { surprise: '놀라움', connection: '연결', afterglow: '여운' };
export const STAR_COLORS: Record<StarKind, string> = { surprise: 'var(--gold)', connection: 'var(--glow-teal)', afterglow: 'var(--glow-violet)' };

/** 세계 요약 카드. 성운 기록 화면과 이미지 내보내기에 함께 쓴다 */
export const WorldCard = forwardRef<HTMLDivElement, { world: WorldRecord }>(function WorldCard({ world }, ref) {
  const object = getToken(world.objectId);
  const attribute = getToken(world.attributeId);
  const stars = new Map(world.timeline.map((e) => [e.id, e.stars]));
  const byType = (t: FragmentType) => world.fragments.filter((f) => f.type === t);
  const glow = (id: string) => {
    const s = stars.get(id) ?? {};
    const top = (Object.entries(s) as [StarKind, number][]).sort((a, b) => b[1] - a[1])[0];
    return top ? { textShadow: `0 0 18px ${STAR_COLORS[top[0]]}`, title: `${STAR_LABELS[top[0]]} ${top[1]}` } : {};
  };

  return (
    <div ref={ref} className="world-card">
      <div className="world-card__head">
        <Planet objectId={world.objectId} attributeId={world.attributeId} size={112} />
        <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
          <span className="caption" style={{ letterSpacing: '0.2em', color: 'var(--mist-blue)' }}>
            {world.serial}
          </span>
          <h2 className="display">{world.name}</h2>
          <span className="caption">
            {object?.label} + {attribute?.label} · {world.discovery.name}
          </span>
        </div>
      </div>

      {byType('rule').length ? (
        <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <h3 className="world-card__label">세계의 규칙</h3>
          <ol className="world-card__rules">
            {byType('rule').map((f, i) => (
              <li key={f.contributionId}>
                <span className="world-card__num">{i + 1}</span>
                <span style={glow(f.contributionId)}>{f.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="world-card__grid">
        {(['place', 'resident', 'event'] as const).map((t) => (
          <section key={t} className="world-card__cell">
            <h3 className="world-card__label">{fragmentLabels[t]}</h3>
            {byType(t).length ? (
              byType(t).map((f) => (
                <p key={f.contributionId} style={glow(f.contributionId)}>
                  {f.text}
                </p>
              ))
            ) : (
              <p className="muted">아직 비어 있는 자리</p>
            )}
          </section>
        ))}
      </div>

      <footer className="caption world-card__foot">
        <span>함께 만든 사람 · {world.members.join(', ')}</span>
        <span>{new Date(world.createdAt).toLocaleDateString('ko-KR')}</span>
      </footer>
    </div>
  );
});
