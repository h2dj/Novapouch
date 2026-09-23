import { categoryLabels, findBlockedWords, getQuestion } from '@novapouch/content';
import { ANSWER_MAX, type GameView } from '@novapouch/game-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Timer, TopBar } from '../components/bits';
import { Fragment } from '../components/Fragment';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useDraftSaver, useGameLabels } from '../lib/hooks';
import { useRoom } from '../lib/room';

export function Explore({ view }: { view: GameView }) {
  const ex = view.explore!;
  const { object, attribute, question, nick } = useGameLabels(view);
  const mine = view.contributions.find((c) => c.phase === 'explore' && c.round === ex.round && c.playerId === view.you);

  return (
    <div className="page">
      <TopBar
        crumb={`방 ${view.code}  /  탐사  ${ex.round} / ${view.settings.rounds}`}
        right={<Timer deadlineAt={view.deadlineAt} label={ex.step === 'PICK' ? '질문 고르기까지' : '답변 마감까지'} />}
      />
      <main className="split split--left">
        <aside className="stack explore__side">
          <div className="token token--object">
            <span className="token__kind">{view.discovery?.name}</span>
            <span className="token__label" style={{ fontSize: 22 }}>
              {object?.label}
            </span>
            <span style={{ color: 'var(--lavender)', fontSize: 15 }}>{attribute?.label}</span>
          </div>
          {view.discovery?.use ? <p className="caption">{view.discovery.use}</p> : null}
          <Progress view={view} />
        </aside>

        <section className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
          {ex.step === 'PICK' ? (
            <PickQuestion view={view} />
          ) : (
            <>
              <div className="question enter" key={ex.questionId}>
                <span className="eyebrow" style={{ color: 'var(--mist-blue)' }}>
                  {ex.round}라운드 · {question ? categoryLabels[question.category] : ''} 질문
                </span>
                <h1 className="question__text">{question?.text}</h1>
              </div>
              <RoundFragments view={view} />
              <Composer view={view} submitted={Boolean(mine)} key={`${ex.round}`} />
            </>
          )}
          <PastRounds view={view} />
        </section>
      </main>
      <span className="sr-only" aria-live="polite">
        {ex.step === 'PICK' ? `${ex.round}라운드. ${nick(ex.turnPlayerId)} 님이 질문을 고를 차례예요.` : `질문: ${question?.text}`}
      </span>
    </div>
  );
}

function Progress({ view }: { view: GameView }) {
  const ex = view.explore!;
  return (
    <ol className="row" style={{ gap: 6, margin: 0, padding: 0, listStyle: 'none' }} aria-label="라운드 진행">
      {Array.from({ length: view.settings.rounds }, (_, i) => {
        const r = i + 1;
        const state = r < ex.round ? 'done' : r === ex.round ? 'now' : 'next';
        return (
          <li
            key={r}
            aria-current={state === 'now' ? 'step' : undefined}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: state === 'done' ? 'var(--gold)' : state === 'now' ? 'var(--glow-teal)' : 'var(--line)',
            }}
          >
            <span className="sr-only">
              {r}라운드 {state === 'done' ? '완료' : state === 'now' ? '진행 중' : '대기'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PickQuestion({ view }: { view: GameView }) {
  const act = useRoom((s) => s.act);
  const ex = view.explore!;
  const { nick, isHost } = useGameLabels(view);
  const myTurn = ex.turnPlayerId === view.you;
  const turnPlayer = view.players.find((p) => p.id === ex.turnPlayerId);
  const canPick = myTurn || (isHost && !turnPlayer?.connected);
  return (
    <div className="stack" style={{ '--gap': '14px' } as React.CSSProperties}>
      <div className="row">
        <Avatar view={view} playerId={ex.turnPlayerId} name={nick(ex.turnPlayerId)} />
        <div className="stack" style={{ '--gap': '0' } as React.CSSProperties}>
          <h1 className="title">{myTurn ? '질문 카드를 골라 주세요' : `${nick(ex.turnPlayerId)} 님이 질문을 고르고 있어요`}</h1>
          <span className="caption">{myTurn ? '고른 질문에 모두가 한 문장씩 답해요.' : '고르지 않으면 30초 뒤 첫 번째 카드로 정해져요.'}</span>
        </div>
      </div>
      <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none', '--gap': '10px' } as React.CSSProperties}>
        {ex.offeredQuestionIds.map((id, i) => {
          const q = getQuestion(id)!;
          return (
            <li key={id} className="enter" style={{ animationDelay: `${i * 120}ms` }}>
              <button type="button" className="question question-choice" disabled={!canPick} onClick={() => act({ type: 'PICK_QUESTION', questionId: id })}>
                <span className="eyebrow" style={{ color: 'var(--mist-blue)' }}>
                  {categoryLabels[q.category]}
                </span>
                <span className="question__text" style={{ fontSize: 18 }}>
                  {q.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RoundFragments({ view }: { view: GameView }) {
  const ex = view.explore!;
  const order = [...view.players].sort((a, b) => a.joinedAt - b.joinedAt);
  const byPlayer = new Map(view.contributions.filter((c) => c.phase === 'explore' && c.round === ex.round).map((c) => [c.playerId, c]));
  return (
    <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none', '--gap': '8px' } as React.CSSProperties} aria-label="이번 라운드의 세계 조각">
      {order.map((p) => {
        const c = byPlayer.get(p.id);
        if (c) return <Fragment key={p.id} view={view} c={c} />;
        return (
          <li key={p.id} className="fragment fragment--pending">
            <Avatar view={view} playerId={p.id} name={p.nickname} small />
            <span className="grow">
              {p.nickname}
              {p.id === view.you ? ' (나)' : ''}
            </span>
            <span className="caption">{p.connected ? '쓰는 중…' : '다시 연결 중'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Composer({ view, submitted }: { view: GameView; submitted: boolean }) {
  const act = useRoom((s) => s.act);
  const ex = view.explore!;
  const question = getQuestion(ex.questionId ?? undefined);
  const mine = view.contributions.find((c) => c.phase === 'explore' && c.round === ex.round && c.playerId === view.you);
  const [text, setText] = useState(view.myDraft);
  const [editing, setEditing] = useState(!submitted);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string[] | null>(null);
  const saved = useDraftSaver(text, editing);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (view.myDraft && !text) setText(view.myDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.myDraft]);

  // 앞 라운드의 낱말 하나를 이어 쓰도록 권하는 메아리 힌트
  const echo = useMemo(() => {
    const prev = view.contributions.filter((c) => c.phase === 'explore' && c.round === ex.round - 1 && c.playerId !== view.you && c.text);
    const words = prev.flatMap((c) => c.text!.split(/\s+/)).filter((w) => w.length >= 2);
    return words.length ? words[(ex.round * 7) % words.length] : null;
  }, [view.contributions, ex.round, view.you]);

  const send = async (value: string, fromChoice: boolean, force = false) => {
    const bad = findBlockedWords(value);
    if (bad.length && !force) return setWarn(bad);
    setWarn(null);
    setBusy(true);
    const ok = await act({ type: 'SUBMIT_ANSWER', text: value, fromChoice });
    setBusy(false);
    if (ok) setEditing(false);
  };

  if (!editing && mine) {
    return (
      <div className="card row wrap" style={{ justifyContent: 'space-between' }}>
        <span className="row" style={{ gap: 8 }}>
          <Icon name="check" color="var(--glow-teal)" />
          문장을 보냈어요. {view.settings.quietMode ? '모두 제출하면 함께 공개돼요.' : ''}
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setText(mine.text ?? '');
            setEditing(true);
            setTimeout(() => ref.current?.focus(), 0);
          }}
        >
          고쳐 쓰기
        </button>
      </div>
    );
  }

  return (
    <form
      className="card stack composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) void send(text, false);
      }}
    >
      <div className="field">
        <label htmlFor="my-sentence" className="field__label">
          내 문장
        </label>
        <textarea
          ref={ref}
          id="my-sentence"
          className="textarea"
          rows={3}
          maxLength={ANSWER_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) void send(text, false);
          }}
          placeholder="짧아도 괜찮아요. 떠오른 장면 하나를 적어 보세요."
        />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="caption">{text ? (saved ? '자동 저장됨' : '저장 중…') : echo ? `메아리: 앞사람의 “${echo}”를 이어 써 보세요` : ''}</span>
          <span className="field__count">
            {text.length} / {ANSWER_MAX}
          </span>
        </div>
      </div>
      {question && !text.trim() ? (
        <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <span className="caption">조용한 참여 · 글 대신 하나를 골라도 돼요</span>
          <div className="row wrap" style={{ gap: 8 }}>
            {question.choices.map((c) => (
              <button key={c} type="button" className="btn" disabled={busy} onClick={() => send(c, true)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <button type="submit" className="btn btn--primary" disabled={!text.trim() || busy} aria-busy={busy}>
        문장 보내기
      </button>
      {warn ? (
        <Modal labelledBy="warn-title" onClose={() => setWarn(null)}>
          <h2 id="warn-title" className="title">
            이 표현, 괜찮을까요?
          </h2>
          <p className="muted">
            “{warn.join(', ')}” 같은 표현은 함께하는 사람을 불편하게 할 수 있어요. 그대로 보내면 방장에게 확인 표시가 함께 가요.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn" onClick={() => send(text, false, true)}>
              그대로 보내기
            </button>
            <button
              type="button"
              className="btn btn--primary"
              style={{ minHeight: 44 }}
              onClick={() => {
                setWarn(null);
                setTimeout(() => ref.current?.focus(), 0);
              }}
            >
              고쳐 쓰기
            </button>
          </div>
        </Modal>
      ) : null}
    </form>
  );
}

function PastRounds({ view }: { view: GameView }) {
  const ex = view.explore!;
  const current = ex.step === 'ANSWER' ? ex.round : ex.round;
  const past = view.contributions.filter((c) => c.phase === 'explore' && c.round !== null && c.round < current);
  if (!past.length) return null;
  const rounds = [...new Set(past.map((c) => c.round!))].sort((a, b) => b - a);
  return (
    <details className="past" open={ex.step === 'PICK'}>
      <summary>지금까지 모인 세계 조각 {past.length}개</summary>
      <div className="stack" style={{ '--gap': '16px', marginTop: 12 } as React.CSSProperties}>
        {rounds.map((r) => {
          const items = past.filter((c) => c.round === r);
          const q = getQuestion(items[0]?.questionId ?? undefined);
          return (
            <section key={r} className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
              <h2 className="caption">
                {r}라운드 · {q?.text}
              </h2>
              <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none', '--gap': '8px' } as React.CSSProperties}>
                {items.map((c) => (
                  <Fragment key={c.id} view={view} c={c} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </details>
  );
}
