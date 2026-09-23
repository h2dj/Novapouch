import { getQuestion } from '@novapouch/content';
import { WORLD_NAME_MAX, type GameView, type StarKind } from '@novapouch/game-core';
import { useState } from 'react';
import { Avatar, TopBar } from '../components/bits';
import { Icon } from '../components/Icon';
import { Planet } from '../components/Planet';
import { STAR_COLORS, STAR_LABELS } from '../components/WorldCard';
import { useGameLabels } from '../lib/hooks';
import { useRoom } from '../lib/room';

export function Record({ view }: { view: GameView }) {
  const { act } = useRoom.getState();
  const rec = view.record!;
  const { nick, isHost, object, attribute } = useGameLabels(view);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const myVote = rec.votes[view.you];
  const counts = new Map<string, number>();
  for (const id of Object.values(rec.votes)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const sentences = view.contributions.filter((c) => !c.masked && !c.hidden && c.text);

  const propose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await act({ type: 'PROPOSE_NAME', text: name })) setName('');
  };

  const myStar = (id: string) => rec.stars.find((s) => s.fromPlayerId === view.you && s.contributionId === id)?.kind;
  const starCount = (id: string, kind: StarKind) => rec.stars.filter((s) => s.contributionId === id && s.kind === kind).length;

  return (
    <div className="page has-bottom-bar">
      <TopBar crumb={`방 ${view.code}  /  기록`} />
      <main className="split">
        <section className="stack" style={{ '--gap': '24px' } as React.CSSProperties}>
          <div className="row" style={{ gap: 16 }}>
            <Planet objectId={view.objectId ?? ''} attributeId={view.attributeId ?? ''} size={88} />
            <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
              <span className="eyebrow" style={{ color: 'var(--gold)' }}>
                마지막 단계
              </span>
              <h1 className="title">세계에 이름을 붙이고, 마음에 남은 문장에 별을 보내요</h1>
              <span className="caption">
                {attribute?.label} {object?.label} · {view.discovery?.name}
              </span>
            </div>
          </div>

          <section className="stack" aria-labelledby="names-title">
            <h2 id="names-title" style={{ fontSize: 17 }}>
              세계의 이름
            </h2>
            <div role="radiogroup" aria-labelledby="names-title" className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
              {rec.proposals.map((p) => (
                <label key={p.id} className={`candidate${myVote === p.id ? ' candidate--selected' : ''}`}>
                  <input type="radio" name="world-name" checked={myVote === p.id} onChange={() => act({ type: 'VOTE_NAME', proposalId: p.id })} />
                  <span className="fragment__body">
                    <span style={{ fontSize: 18, fontWeight: 500 }}>{p.text}</span>
                    <span className="fragment__meta">
                      {p.id === 'p0' ? `${nick(p.playerId)}의 발견 카드` : `${nick(p.playerId)} 제안`}
                    </span>
                  </span>
                  <span className="caption">{counts.get(p.id) ?? 0}표</span>
                </label>
              ))}
            </div>
            <form className="row" style={{ gap: 8 }} onSubmit={propose}>
              <label htmlFor="world-name" className="sr-only">
                세계 이름 제안
              </label>
              <input
                id="world-name"
                className="input grow"
                style={{ fontSize: 16 }}
                maxLength={WORLD_NAME_MAX}
                placeholder="예: 비의 기억을 거르는 도시"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" className="btn" style={{ minHeight: 52 }} disabled={!name.trim()}>
                이름 제안
              </button>
            </form>
          </section>

          <section className="stack" aria-labelledby="stars-title">
            <div className="stack" style={{ '--gap': '2px' } as React.CSSProperties}>
              <h2 id="stars-title" style={{ fontSize: 17 }}>
                별 보내기
              </h2>
              <p className="caption">순위를 매기지 않아요. 별을 받은 문장은 기록에서 조금 더 밝게 빛나요.</p>
            </div>
            <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none', '--gap': '8px' } as React.CSSProperties}>
              {sentences.map((c) => {
                const mine = c.playerId === view.you;
                const q = getQuestion(c.questionId ?? undefined);
                return (
                  <li key={c.id} className="fragment" style={{ flexDirection: 'column', gap: 10 }}>
                    <div className="row" style={{ alignItems: 'flex-start' }}>
                      <Avatar view={view} playerId={c.playerId} name={nick(c.playerId)} small />
                      <div className="fragment__body">
                        <span>{c.text}</span>
                        <span className="fragment__meta">
                          {nick(c.playerId)} · {q ? q.text : '직접 제안'}
                        </span>
                      </div>
                    </div>
                    <div className="row wrap" style={{ gap: 6 }} role="group" aria-label="별 보내기">
                      {(Object.keys(STAR_LABELS) as StarKind[]).map((k) => {
                        const on = myStar(c.id) === k;
                        const n = starCount(c.id, k);
                        return (
                          <button
                            key={k}
                            type="button"
                            className="btn star-btn"
                            aria-pressed={on}
                            disabled={mine}
                            style={on ? { borderColor: STAR_COLORS[k], color: STAR_COLORS[k] } : undefined}
                            onClick={() => act({ type: 'GIVE_STAR', contributionId: c.id, kind: k })}
                          >
                            <Icon name="star" size={16} color={on || n ? STAR_COLORS[k] : 'currentColor'} />
                            {STAR_LABELS[k]}
                            {n ? <span className="caption">{n}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </section>

        <aside className="stack connect__aside">
          <section className="card card--glass stack">
            <h2 style={{ fontSize: 17 }}>공개 범위</h2>
            <div role="radiogroup" aria-label="공개 범위" className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
              {(
                [
                  ['members', '참여자만', '함께 만든 사람만 성운 기록에서 볼 수 있어요'],
                  ['link', '링크가 있는 사람', '링크를 받은 사람도 이 세계를 볼 수 있어요'],
                ] as const
              ).map(([value, label, desc]) => (
                <label key={value} className="option" style={{ alignItems: 'flex-start', padding: '6px 0' }}>
                  <input
                    type="radio"
                    name="visibility"
                    checked={rec.visibility === value}
                    disabled={!isHost}
                    onChange={() => act({ type: 'SET_VISIBILITY', visibility: value })}
                    style={{ accentColor: 'var(--glow-teal)', marginTop: 4 }}
                  />
                  <span className="stack" style={{ '--gap': '0' } as React.CSSProperties}>
                    <span>{label}</span>
                    <span className="caption">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
            {!isHost ? <span className="caption">공개 범위는 방장이 모두와 합의해 정해요.</span> : null}
          </section>
          <div className="stack connect__actions" style={{ '--gap': '6px' } as React.CSSProperties}>
            {isHost ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                aria-busy={busy}
                onClick={async () => {
                  setBusy(true);
                  await act({ type: 'FINALIZE' });
                  setBusy(false);
                }}
              >
                성운에 저장
              </button>
            ) : (
              <p className="card card--quiet" style={{ textAlign: 'center', padding: 14 }}>
                방장이 저장하면 세계가 완성돼요
              </p>
            )}
            <span className="caption" style={{ textAlign: 'center' }}>
              {Object.keys(rec.votes).length} / {view.players.length}명이 이름에 투표했어요
            </span>
          </div>
        </aside>
      </main>
    </div>
  );
}
