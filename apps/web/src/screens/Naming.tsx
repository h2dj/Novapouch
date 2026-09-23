import { NAME_MAX, USE_MAX, type GameView } from '@novapouch/game-core';
import { useEffect, useState } from 'react';
import { Avatar, Timer, TokenPair, TopBar } from '../components/bits';
import { Icon } from '../components/Icon';
import { Planet } from '../components/Planet';
import { useDraftSaver, useGameLabels } from '../lib/hooks';
import { useRoom } from '../lib/room';

export function Naming({ view }: { view: GameView }) {
  const act = useRoom((s) => s.act);
  const { object, attribute, nick, isHost } = useGameLabels(view);
  const isDiscoverer = view.discovererId === view.you;
  const [initialName = '', ...rest] = view.myDraft.split('\n');
  const [name, setName] = useState(initialName);
  const [use, setUse] = useState(rest.join(' '));
  const [busy, setBusy] = useState(false);
  const canWrite = isDiscoverer || isHost;
  const saved = useDraftSaver(`${name}\n${use}`, canWrite);
  const [takeOver, setTakeOver] = useState(false);
  const writing = isDiscoverer || takeOver;
  const discoverer = view.players.find((p) => p.id === view.discovererId);

  useEffect(() => {
    if (!view.myDraft || name || use) return;
    const [n = '', ...r] = view.myDraft.split('\n');
    setName(n);
    setUse(r.join(' '));
    // 재접속 뒤 처음 받은 초안만 채운다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.myDraft]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await act({ type: 'SUBMIT_DISCOVERY', name, use });
    setBusy(false);
  };

  const others = view.players.filter((p) => p.id !== view.discovererId);

  return (
    <div className="page">
      <TopBar
        crumb={`방 ${view.code}  /  명명`}
        right={
          <>
            {writing ? (
              <span className="caption row" style={{ gap: 4 }}>
                <Icon name="check" size={14} />
                {saved ? '자동 저장됨' : '저장 중'}
              </span>
            ) : null}
            <Timer deadlineAt={view.deadlineAt} />
          </>
        }
      />
      <main className="naming">
        <section className="stack naming__tokens">
          <span className="eyebrow">첫 번째 발견</span>
          <TokenPair object={object} attribute={attribute} />
          <div className="card row" style={{ alignItems: 'flex-start', padding: 14, gap: 10 }}>
            <Icon name="bulb" color="var(--gold)" />
            <span className="caption" style={{ fontSize: 14 }}>
              막히면 쓰임부터 적어 보세요. “○○을 ○○하는 {object?.label ?? '물건'}”처럼요.
            </span>
          </div>
          {isDiscoverer ? (
            <div className="row naming__waiting">
              <div className="row" style={{ gap: 0 }}>
                {others.map((p, i) => (
                  <span key={p.id} style={{ marginLeft: i ? -8 : 0 }}>
                    <Avatar view={view} playerId={p.id} name={p.nickname} small />
                  </span>
                ))}
              </div>
              <span className="caption">{others.length}명이 발견 카드를 기다리고 있어요</span>
            </div>
          ) : null}
        </section>

        {writing ? (
          <form className="card stack naming__form" style={{ '--gap': '18px' } as React.CSSProperties} onSubmit={submit}>
            <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
              <h1 className="title">이 물건에 이름을 붙여 주세요</h1>
              <p className="caption">
                {isDiscoverer ? '당신이 첫 발견자예요.' : `${discoverer?.nickname ?? '첫 발견자'} 님 대신 방장이 이어 써요.`} 이름과 쓰임은 다음
                단계에서 모두가 이어 씁니다.
              </p>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="obj-name">
                물건의 이름
              </label>
              <input id="obj-name" className="input" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <span className="field__count">
                {name.length} / {NAME_MAX}
              </span>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="obj-use">
                한 줄 쓰임
              </label>
              <textarea id="obj-use" className="textarea" rows={3} maxLength={USE_MAX} value={use} onChange={(e) => setUse(e.target.value)} />
              <span className="field__count">
                {use.length} / {USE_MAX}
              </span>
            </div>
            <div className="row wrap" style={{ gap: 10 }}>
              {!view.extendUsed ? (
                <button type="button" className="btn" style={{ minHeight: 56 }} onClick={() => act({ type: 'EXTEND' })}>
                  30초 더 생각하기 <span className="caption">(1회)</span>
                </button>
              ) : null}
              <button type="submit" className="btn btn--primary grow" disabled={!name.trim() || busy} aria-busy={busy}>
                발견 카드 공개
              </button>
            </div>
          </form>
        ) : (
          <section className="card stack naming__form" style={{ '--gap': '16px', alignItems: 'center', textAlign: 'center' } as React.CSSProperties}>
            <Avatar view={view} playerId={view.discovererId ?? ''} name={nick(view.discovererId)} />
            <h1 className="title">{nick(view.discovererId)} 님이 이름을 짓고 있어요</h1>
            <p className="muted">그동안 이 물건이 누구에게 필요할지 떠올려 두세요. 곧 모두가 질문에 답하게 돼요.</p>
            {isHost && discoverer && !discoverer.connected ? (
              <button type="button" className="btn btn--accent" onClick={() => setTakeOver(true)}>
                첫 발견자 대신 이름 짓기
              </button>
            ) : null}
          </section>
        )}

        <aside className="stack naming__preview" aria-label="발견 카드 미리보기">
          <span className="caption">발견 카드 미리보기</span>
          <article className="card stack" style={{ '--gap': '12px', background: 'linear-gradient(180deg, var(--surface-2), var(--surface-1))' } as React.CSSProperties}>
            <div style={{ alignSelf: 'center' }}>
              <Planet objectId={view.objectId ?? ''} attributeId={view.attributeId ?? ''} size={112} />
            </div>
            <span className="caption" style={{ letterSpacing: '0.2em', color: 'var(--mist-blue)' }}>
              {object?.code ?? 'OBJECT'}
            </span>
            <span className="title">{writing ? name || '이름 없는 물건' : '이름을 기다리는 중'}</span>
            <span className="muted" style={{ fontSize: 15 }}>
              {writing ? use || '한 줄 쓰임이 여기에 보여요.' : `${attribute?.label ?? ''} ${object?.label ?? ''}`}
            </span>
          </article>
        </aside>
      </main>
    </div>
  );
}
