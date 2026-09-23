import type { GameView } from '@novapouch/game-core';
import { Avatar, Timer, TopBar } from '../components/bits';
import { Icon } from '../components/Icon';
import { PouchArt } from '../components/Pouch';
import { useGameLabels, useRemaining } from '../lib/hooks';
import { useRoom } from '../lib/room';

/** DRAW: 두 파우치를 차례로 연다. IMAGINE: 조합만 보여 주며 5초 동안 상상한다 */
export function Draw({ view }: { view: GameView }) {
  const act = useRoom((s) => s.act);
  const { object, attribute, nick, isHost } = useGameLabels(view);
  const canOpen = view.discovererId === view.you || isHost;
  const imagining = view.phase === 'IMAGINE';
  const sec = useRemaining(imagining ? view.deadlineAt : null);

  const pouch = (kind: 'A' | 'B') => {
    const opened = view.opened[kind];
    const token = kind === 'A' ? object : attribute;
    const nextToOpen = !opened && (kind === 'A' || view.opened.A);
    return (
      <div className="draw__slot">
        {opened ? (
          <div className={`token ${kind === 'A' ? 'token--object' : 'token--attribute'} draw__token`} key={token?.id}>
            <span className="token__kind">{kind === 'A' ? 'A  사물' : 'B  속성'}</span>
            <span className="token__label" style={{ fontSize: kind === 'A' ? 34 : 26 }}>
              {token?.label}
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="draw__pouch"
            disabled={!canOpen || imagining}
            onClick={() => act({ type: 'OPEN_POUCH', pouch: kind })}
            aria-label={`${kind} 파우치 열기 (${kind === 'A' ? '사물' : '속성'})`}
          >
            <span className={nextToOpen ? 'drift' : undefined} style={{ display: 'inline-flex' }}>
              <PouchArt kind={kind} size={140} />
            </span>
            <span className="caption">{kind === 'A' ? '사물' : '속성'}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <TopBar crumb={`방 ${view.code}  /  토큰 추첨`} right={!imagining ? <Timer deadlineAt={view.deadlineAt} label="자동으로 열리기까지" /> : null} />
      <main className="stack draw" style={{ '--gap': '24px' } as React.CSSProperties}>
        <div className="stack" style={{ '--gap': '8px', textAlign: 'center' } as React.CSSProperties}>
          <span className="eyebrow">첫 번째 발견</span>
          {imagining ? (
            <h1 className="display veil">잠시 상상해 보세요</h1>
          ) : canOpen ? (
            <h1 className="display">파우치를 열어 주세요</h1>
          ) : (
            <h1 className="display">{nick(view.discovererId)} 님이 파우치를 열고 있어요</h1>
          )}
          <p className="muted">
            {imagining
              ? '평가하기 전에, 이 조합이 존재하는 세계를 떠올려 보세요.'
              : canOpen
                ? 'A 파우치에서 사물을, B 파우치에서 속성을 꺼내요.'
                : '곧 두 토큰이 천천히 떠오를 거예요.'}
          </p>
        </div>

        <div className="draw__pair">
          {pouch('A')}
          <span className="draw__plus" aria-hidden="true">
            +
          </span>
          {pouch('B')}
        </div>

        {imagining ? (
          <div className="stack" style={{ '--gap': '12px', alignItems: 'center' } as React.CSSProperties}>
            <div className="imagine-count" role="timer" aria-live="off">
              {String(sec ?? 0).padStart(2, '0')}
            </div>
            {canOpen && !view.rerollUsed ? (
              <button type="button" className="btn" onClick={() => act({ type: 'REROLL' })}>
                <Icon name="shake" size={18} />
                속성 다시 흔들기
              </button>
            ) : null}
            <span className="caption">다시 흔들기는 한 게임에 한 번만 사용할 수 있어요</span>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: 'center' }}>
            <Avatar view={view} playerId={view.discovererId ?? ''} name={nick(view.discovererId)} small />
            <span className="caption">첫 발견자 · {nick(view.discovererId)}</span>
          </div>
        )}
      </main>
    </div>
  );
}
