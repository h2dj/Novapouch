import { categoryLabels, findBlockedWords, getQuestion } from '@novapouch/content';
import { ANSWER_MAX, CONNECT_STEPS, fragmentLabels, type FragmentType, type GameView } from '@novapouch/game-core';
import { useEffect, useState } from 'react';
import { Timer, TopBar } from '../components/bits';
import { Icon } from '../components/Icon';
import { useGameLabels } from '../lib/hooks';
import { useRoom } from '../lib/room';

const HELP: Record<FragmentType, string> = {
  place: '이 물건이 있는 세계의 장소를 하나 골라 주세요.',
  resident: '이 세계에 사는 사람이나 존재를 하나 골라 주세요.',
  rule: '이 세계가 따르는 규칙 3개를 골라 주세요.',
  event: '오늘 이 세계에서 일어난 사건을 하나 골라 주세요.',
};

const PLACEHOLDER: Record<FragmentType, string> = {
  place: '예: 비가 멈추지 않는 지붕 도시',
  resident: '예: 기억을 수선하는 우산 장인',
  rule: '예: 우산을 펼치면 기억 하나를 잃는다',
  event: '예: 오늘 처음으로 모든 구멍이 닫혔다',
};

export function Connect({ view }: { view: GameView }) {
  const { act } = useRoom.getState();
  const con = view.connect!;
  const step = CONNECT_STEPS[con.stepIndex]!;
  const { nick, isHost } = useGameLabels(view);
  const confirmedHere = con.confirmed[step.type];
  const need = step.pick - confirmedHere.length;
  const myVote = con.votes[view.you];
  const [picked, setPicked] = useState<string[]>(myVote ?? []);
  const [proposal, setProposal] = useState('');
  const [busy, setBusy] = useState(false);
  const present = view.players.filter((p) => p.connected);
  const voted = Object.keys(con.votes).length;

  useEffect(() => setPicked(con.votes[view.you] ?? []), [con.stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = new Map<string, number>();
  for (const ids of Object.values(con.votes)) for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  const candidates = view.contributions.filter((c) => view.candidateIds.includes(c.id));
  // 이 단계에 직접 제안된 조각을 먼저, 그다음 탐사 문장
  candidates.sort((a, b) => Number(b.phase === 'connect') - Number(a.phase === 'connect'));
  const confirmed = view.contributions.filter((c) => confirmedHere.includes(c.id));

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= need ? (need === 1 ? [id] : p) : [...p, id]));

  const vote = async () => {
    setBusy(true);
    await act({ type: 'VOTE', contributionIds: picked });
    setBusy(false);
  };

  const propose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposal.trim()) return;
    if (findBlockedWords(proposal).length && !confirm('다른 사람을 불편하게 할 수 있는 표현이 있어요. 그대로 제안할까요?')) return;
    if (await act({ type: 'PROPOSE_FRAGMENT', text: proposal })) setProposal('');
  };

  return (
    <div className="page has-bottom-bar">
      <TopBar
        crumb={`방 ${view.code}  /  연결`}
        right={
          <>
            <span className="caption connect__count">
              {voted} / {present.length}명 투표
            </span>
            <Timer deadlineAt={view.deadlineAt} label="투표 마감까지" />
          </>
        }
      />
      <nav aria-label="연결 단계">
        <ol className="connect__steps">
          {CONNECT_STEPS.map((s, i) => {
            const state = i < con.stepIndex ? 'done' : i === con.stepIndex ? 'now' : 'next';
            return (
              <li key={s.type} aria-current={state === 'now' ? 'step' : undefined} className={`connect__step connect__step--${state}`}>
                {state === 'done' ? <Icon name="check" size={14} color="var(--gold)" /> : null}
                {fragmentLabels[s.type]}
                {state === 'now' ? ' · 투표 중' : ''}
              </li>
            );
          })}
        </ol>
      </nav>

      <main className="split">
        <section className="stack" style={{ '--gap': '14px' } as React.CSSProperties}>
          <div className="row wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
              <h1 className="title">{HELP[step.type]}</h1>
              <p className="caption">가장 많이 고른 조각이 확정되고, 동률이면 방장의 선택을 따라요. 알맞은 문장이 없으면 직접 제안해도 돼요.</p>
            </div>
            <span className="caption" style={{ color: 'var(--glow-teal)', fontWeight: 500 }}>
              내 선택 {picked.length} / {need}
            </span>
          </div>

          <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none', '--gap': '8px' } as React.CSSProperties}>
            {confirmed.map((c) => (
              <li key={c.id} className="candidate candidate--confirmed">
                <span className="avatar avatar--sm" style={{ background: 'var(--gold)', borderRadius: 7 }}>
                  <Icon name="check" size={14} />
                </span>
                <span className="fragment__body">
                  <span>{c.text}</span>
                  <span className="fragment__meta">{nick(c.playerId)} · 확정</span>
                </span>
              </li>
            ))}
            {candidates.map((c) => {
              const selected = picked.includes(c.id);
              const disabled = !selected && picked.length >= need && need !== 1;
              const q = getQuestion(c.questionId ?? undefined);
              return (
                <li key={c.id}>
                  <label className={`candidate${selected ? ' candidate--selected' : ''}${disabled ? ' candidate--disabled' : ''}`}>
                    <input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggle(c.id)} />
                    <span className="fragment__body">
                      <span>{c.text ?? '가려진 문장'}</span>
                      <span className="fragment__meta">
                        {nick(c.playerId)}
                        {c.playerId === view.you ? '(나)' : ''} · {c.phase === 'connect' ? '직접 제안' : `${q ? categoryLabels[q.category] : ''} 질문 · ${c.round}라운드`}
                      </span>
                    </span>
                    <span className="caption" style={{ color: count.get(c.id) ? 'var(--glow-teal)' : undefined, whiteSpace: 'nowrap' }}>
                      {count.get(c.id) ?? 0}표
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <form className="row" style={{ gap: 8 }} onSubmit={propose}>
            <label htmlFor="proposal" className="sr-only">
              {fragmentLabels[step.type]} 직접 제안하기
            </label>
            <input
              id="proposal"
              className="input grow"
              style={{ fontSize: 16 }}
              maxLength={ANSWER_MAX}
              placeholder={PLACEHOLDER[step.type]}
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
            />
            <button type="submit" className="btn" style={{ minHeight: 52 }} disabled={!proposal.trim()}>
              제안
            </button>
          </form>
        </section>

        <aside className="stack connect__aside">
          <WorldSoFar view={view} />
          <div className="stack connect__actions" style={{ '--gap': '8px' } as React.CSSProperties}>
            <button type="button" className="btn btn--primary" onClick={vote} disabled={busy} aria-busy={busy}>
              {myVote ? '투표 고치기' : picked.length ? '투표 보내기' : '고르지 않고 넘기기'}
            </button>
            {myVote ? <span className="caption" style={{ textAlign: 'center' }}>투표했어요. 모두 투표하면 다음으로 넘어가요.</span> : null}
            {isHost ? (
              <button type="button" className="btn" onClick={() => act({ type: 'CLOSE_STEP' })}>
                지금 마감하기 · 방장
              </button>
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  );
}

function WorldSoFar({ view }: { view: GameView }) {
  const con = view.connect!;
  const text = (id: string) => view.contributions.find((c) => c.id === id)?.text ?? '';
  return (
    <section className="card card--glass stack" aria-labelledby="sofar" style={{ '--gap': '12px' } as React.CSSProperties}>
      <div className="stack" style={{ '--gap': '2px' } as React.CSSProperties}>
        <span className="caption" style={{ letterSpacing: '0.16em', color: 'var(--mist-blue)' }}>
          {view.discovery?.name}
        </span>
        <h2 id="sofar" style={{ fontSize: 18 }}>
          지금까지 세운 세계
        </h2>
      </div>
      <dl className="stack" style={{ margin: 0, '--gap': '10px' } as React.CSSProperties}>
        {CONNECT_STEPS.map((s, i) => {
          const ids = con.confirmed[s.type];
          const pending = i >= con.stepIndex;
          return (
            <div key={s.type} className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
              <dt className="caption" style={{ color: pending ? 'var(--mist-blue)' : 'var(--gold)' }}>
                {fragmentLabels[s.type]}
                {s.pick > 1 ? ` · ${ids.length} / ${s.pick}` : ''}
              </dt>
              {ids.map((id, k) => (
                <dd key={id} style={{ margin: 0, fontSize: 15 }}>
                  {s.pick > 1 ? `${k + 1}  ` : ''}
                  {text(id)}
                </dd>
              ))}
              {pending && ids.length < s.pick ? (
                <dd className="caption" style={{ margin: 0, border: '1px dashed var(--line)', borderRadius: 8, padding: '4px 10px' }}>
                  {i === con.stepIndex ? '투표 중' : '다음 단계에서 골라요'}
                </dd>
              ) : null}
              {!pending && !ids.length ? (
                <dd className="caption" style={{ margin: 0 }}>
                  비워 두었어요
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
