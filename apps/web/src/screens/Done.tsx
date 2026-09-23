import type { GameView, WorldRecord } from '@novapouch/game-core';
import { useEffect, useRef, useState } from 'react';
import { TopBar } from '../components/bits';
import { Icon } from '../components/Icon';
import { WorldCard } from '../components/WorldCard';
import { api } from '../lib/api';
import { exportImage } from '../lib/exportImage';
import { useRoom } from '../lib/room';
import { navigate } from '../lib/router';

export function Done({ view }: { view: GameView }) {
  const { act, exit, toast } = useRoom.getState();
  const [world, setWorld] = useState<WorldRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const isHost = view.hostId === view.you;

  useEffect(() => {
    if (!view.worldId) return;
    api
      .world(view.worldId)
      .then((r) => setWorld(r.world))
      .catch((e: Error) => setError(e.message));
  }, [view.worldId]);

  return (
    <div className="page">
      <TopBar crumb={`${world?.name ?? '세계'}  /  완성`} />
      <main className="stack done" style={{ '--gap': '20px' } as React.CSSProperties}>
        <div className="stack" style={{ '--gap': '4px', textAlign: 'center' } as React.CSSProperties}>
          <span className="eyebrow" style={{ color: 'var(--gold)' }}>
            성운에 저장했어요
          </span>
          <p className="muted">함께 만든 세계가 서로의 기억 속에서 이어져요.</p>
        </div>
        {world ? (
          <div className="veil">
            <WorldCard ref={card} world={world} />
          </div>
        ) : (
          <p className="card" role="status">
            {error ?? '세계 기록을 불러오는 중이에요…'}
          </p>
        )}
        <div className="row wrap" style={{ gap: 10, justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn--accent"
            disabled={!world}
            onClick={async () => {
              if (!card.current || !world) return;
              try {
                await exportImage(card.current, world.name);
              } catch {
                toast('이미지를 만들지 못했어요. 화면을 캡처해 주세요.', 'error');
              }
            }}
          >
            <Icon name="download" size={18} />
            이미지로 내보내기
          </button>
          {world ? (
            <button type="button" className="btn" onClick={() => navigate(`/w/${world.id}`)}>
              기여 기록 보기
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => navigate('/nebula')}>
            성운 기록
          </button>
        </div>
        <div className="stack" style={{ '--gap': '8px', maxWidth: 440, width: '100%', margin: '0 auto' } as React.CSSProperties}>
          {isHost ? (
            <button type="button" className="btn btn--primary" onClick={() => act({ type: 'RESTART' })}>
              새 조합으로 다시 하기
            </button>
          ) : (
            <p className="caption" style={{ textAlign: 'center' }}>
              방장이 새 조합을 열면 이 방에서 이어서 할 수 있어요.
            </p>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              exit();
              navigate('/');
            }}
          >
            방 나가기
          </button>
        </div>
      </main>
    </div>
  );
}
