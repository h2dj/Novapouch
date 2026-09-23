import { ANSWER_SECONDS_OPTIONS, MAX_PLAYERS, MIN_PLAYERS, ROUND_OPTIONS, type GameView } from '@novapouch/game-core';
import { useState } from 'react';
import { Avatar, TopBar } from '../components/bits';
import { Icon } from '../components/Icon';
import { useRoom } from '../lib/room';
import { inviteLink, useConfig } from '../lib/config';
import { navigate } from '../lib/router';

export function Lobby({ view }: { view: GameView }) {
  const { act, exit, toast } = useRoom.getState();
  const [busy, setBusy] = useState(false);
  const isHost = view.hostId === view.you;
  const present = view.players.filter((p) => p.connected).length;
  const link = inviteLink(view.code);
  const brand = useConfig((s) => s.brand);
  const minutes = Math.round((60 + 30 * view.settings.rounds + view.settings.rounds * view.settings.answerSeconds * 0.8 + 270 + 120) / 60);
  const order = [...view.players].sort((a, b) => a.joinedAt - b.joinedAt);

  const copy = async (text: string, what: string) => {
    try {
      if (navigator.share && /Mobi/.test(navigator.userAgent) && what === '링크') {
        await navigator.share({ title: `${brand} 초대`, text: `초대 코드 ${view.code}`, url: link });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast(`${what}를 복사했어요.`);
    } catch {
      toast(`복사하지 못했어요. ${text} 를 직접 알려 주세요.`, 'error');
    }
  };

  const setSetting = (settings: Partial<GameView['settings']>) => act({ type: 'UPDATE_SETTINGS', settings });

  return (
    <div className="page">
      <TopBar
        crumb={`방 ${view.code}  /  대기실`}
        right={
          <button
            type="button"
            className="btn"
            onClick={() => {
              exit();
              navigate('/');
            }}
          >
            방 나가기
          </button>
        }
      />
      <main className="split">
        <section className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
          <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
            <span className="eyebrow">WAITING ROOM</span>
            <h1 className="display">
              함께 세계를 발견할
              <br />
              사람을 기다리고 있어요
            </h1>
            <p className="muted">초대 코드나 링크를 보내 주세요. 두 명 이상 모이면 파우치를 열 수 있어요.</p>
          </div>

          <div className="card card--glass row wrap" style={{ justifyContent: 'space-between' }}>
            <div className="stack" style={{ '--gap': '0' } as React.CSSProperties}>
              <span className="caption">초대 코드</span>
              <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '0.22em' }}>{view.code}</span>
            </div>
            <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
              <button type="button" className="btn btn--accent" onClick={() => copy(link, '링크')}>
                <Icon name="link" size={18} />
                초대 링크 보내기
              </button>
              <button type="button" className="btn" onClick={() => copy(view.code, '코드')}>
                <Icon name="copy" size={18} />
                코드만 복사
              </button>
            </div>
          </div>

          <ol className="stack caption" style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 15 }}>
            {[
              ['var(--glow-teal)', '두 파우치에서 사물과 속성을 하나씩 뽑아요'],
              ['var(--glow-violet)', '같은 질문에 각자 한 문장씩 답해요'],
              ['var(--gold)', '세계의 규칙을 함께 고르고 이름을 붙여요'],
            ].map(([color, text], i) => (
              <li key={i} className="row">
                <span className="avatar avatar--sm" style={{ background: 'transparent', border: `1px solid ${color}`, color }}>
                  {i + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>
        </section>

        <aside className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
          <section className="card card--glass stack" aria-labelledby="members-title">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="members-title" style={{ fontSize: 17 }}>
                탐사자
              </h2>
              <span className="caption">
                {view.players.length} / {MAX_PLAYERS}명
              </span>
            </div>
            <ul className="lobby-members">
              {order.map((p) => (
                <li key={p.id} className="member">
                  <Avatar view={view} playerId={p.id} name={p.nickname} />
                  <span className="grow">
                    {p.nickname}
                    {p.id === view.you ? <span className="caption"> (나)</span> : null}
                  </span>
                  {p.id === view.hostId ? (
                    <span className="chip chip--gold">방장</span>
                  ) : (
                    <span className="caption" style={{ color: p.connected ? 'var(--glow-teal)' : undefined }}>
                      {p.connected ? '● 입장함' : '○ 다시 연결 중'}
                    </span>
                  )}
                </li>
              ))}
              {Array.from({ length: MAX_PLAYERS - view.players.length }, (_, i) => (
                <li key={`empty${i}`} className="member member--empty">
                  빈 자리
                </li>
              ))}
            </ul>
          </section>

          <section className="card card--glass stack" aria-labelledby="settings-title" style={{ '--gap': '14px' } as React.CSSProperties}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="settings-title" style={{ fontSize: 17 }}>
                방 설정
              </h2>
              {!isHost ? <span className="caption">방장만 바꿀 수 있어요</span> : null}
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span id="rounds-label">탐사 라운드</span>
              <div className="row" style={{ gap: 4 }} role="group" aria-labelledby="rounds-label">
                <button
                  type="button"
                  className="btn"
                  style={{ width: 44, padding: 0 }}
                  aria-label="라운드 줄이기"
                  disabled={!isHost || view.settings.rounds <= ROUND_OPTIONS[0]!}
                  onClick={() => setSetting({ rounds: view.settings.rounds - 1 })}
                >
                  <Icon name="minus" size={18} />
                </button>
                <span style={{ width: 56, textAlign: 'center', fontWeight: 700 }} aria-live="polite">
                  {view.settings.rounds}회
                </span>
                <button
                  type="button"
                  className="btn"
                  style={{ width: 44, padding: 0 }}
                  aria-label="라운드 늘리기"
                  disabled={!isHost || view.settings.rounds >= ROUND_OPTIONS[ROUND_OPTIONS.length - 1]!}
                  onClick={() => setSetting({ rounds: view.settings.rounds + 1 })}
                >
                  <Icon name="plus" size={18} />
                </button>
              </div>
            </div>
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <span id="seconds-label">답변 시간</span>
              <div className="segmented" role="radiogroup" aria-labelledby="seconds-label">
                {ANSWER_SECONDS_OPTIONS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    role="radio"
                    aria-checked={view.settings.answerSeconds === sec}
                    disabled={!isHost}
                    onClick={() => setSetting({ answerSeconds: sec })}
                  >
                    {sec}초
                  </button>
                ))}
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="stack" style={{ '--gap': '0' } as React.CSSProperties}>
                <span id="quiet-label">고요한 탐사</span>
                <span className="caption">모두 제출할 때까지 다른 사람의 답을 가려요</span>
              </span>
              <button
                type="button"
                role="switch"
                className="switch"
                aria-checked={view.settings.quietMode}
                aria-labelledby="quiet-label"
                disabled={!isHost}
                onClick={() => setSetting({ quietMode: !view.settings.quietMode })}
              >
                <span />
              </button>
            </div>
          </section>

          <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
            {isHost ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={present < MIN_PLAYERS || busy}
                aria-busy={busy}
                onClick={async () => {
                  setBusy(true);
                  await act({ type: 'START' });
                  setBusy(false);
                }}
              >
                파우치 열기
              </button>
            ) : (
              <p className="card card--quiet" style={{ textAlign: 'center', padding: 16 }}>
                방장이 파우치를 열면 시작돼요
              </p>
            )}
            <span className="caption" style={{ textAlign: 'center' }}>
              {present < MIN_PLAYERS ? '한 명만 더 오면 시작할 수 있어요' : `${present}명 입장 · 예상 소요 시간 약 ${minutes}분`}
            </span>
          </div>
        </aside>
      </main>
    </div>
  );
}
