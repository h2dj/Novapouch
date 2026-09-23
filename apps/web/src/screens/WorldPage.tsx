import { categoryLabels, getQuestion } from '@novapouch/content';
import { fragmentLabels, type StarKind, type WorldRecord } from '@novapouch/game-core';
import { useEffect, useRef, useState } from 'react';
import { TopBar } from '../components/bits';
import { Icon } from '../components/Icon';
import { STAR_COLORS, STAR_LABELS, WorldCard } from '../components/WorldCard';
import { api } from '../lib/api';
import { exportImage } from '../lib/exportImage';
import { navigate } from '../lib/router';

export function WorldPage({ id }: { id: string }) {
  const [world, setWorld] = useState<WorldRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .world(id)
      .then((r) => setWorld(r.world))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  return (
    <div className="page">
      <TopBar crumb={world ? `성운 기록  /  ${world.name}` : '성운 기록'} onBack={() => navigate('/nebula')} />
      <main className="stack done" style={{ '--gap': '24px' } as React.CSSProperties}>
        {error ? <p className="banner">{error}</p> : null}
        {!world && !error ? <p className="caption">불러오는 중이에요…</p> : null}
        {world ? (
          <>
            <WorldCard ref={card} world={world} />
            <div className="row wrap" style={{ gap: 10 }}>
              <button
                type="button"
                className="btn btn--accent"
                onClick={() => card.current && exportImage(card.current, world.name).catch(() => alert('이미지를 만들지 못했어요.'))}
              >
                <Icon name="download" size={18} />
                이미지로 내보내기
              </button>
            </div>
            <section className="stack" aria-labelledby="timeline-title">
              <h2 id="timeline-title" className="title">
                누가 어떤 질문에서 무엇을 보탰나
              </h2>
              <ol className="timeline">
                {world.timeline.map((e) => {
                  const q = getQuestion(e.questionId ?? undefined);
                  const confirmed = world.fragments.find((f) => f.contributionId === e.id);
                  return (
                    <li key={e.id} className="timeline__item">
                      <span className="caption">
                        {e.phase === 'discovery'
                          ? '발견'
                          : e.phase === 'connect'
                            ? `연결 · ${e.fragmentType ? fragmentLabels[e.fragmentType] : ''} 제안`
                            : `${e.round}라운드 · ${q ? categoryLabels[q.category] : ''}`}
                        {' · '}
                        {new Date(e.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {q && e.phase === 'explore' ? <span className="caption" style={{ color: 'var(--mist-blue)' }}>{q.text}</span> : null}
                      <p>
                        <strong style={{ fontWeight: 500 }}>{e.nickname}</strong> · {e.text}
                      </p>
                      <span className="row wrap" style={{ gap: 6 }}>
                        {confirmed ? <span className="chip chip--gold">{fragmentLabels[confirmed.type]}로 확정</span> : null}
                        {e.fromChoice ? <span className="chip">선택지</span> : null}
                        {(Object.entries(e.stars) as [StarKind, number][]).map(([k, n]) => (
                          <span key={k} className="chip" style={{ borderColor: STAR_COLORS[k], color: STAR_COLORS[k] }}>
                            <Icon name="star" size={12} color={STAR_COLORS[k]} />
                            {STAR_LABELS[k]} {n}
                          </span>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
