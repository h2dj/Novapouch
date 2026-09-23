import { useEffect } from 'react';
import { OfflineBanner } from '../components/bits';
import { useRoom } from '../lib/room';
import { nickname } from '../lib/storage';
import { Connect } from './Connect';
import { Done } from './Done';
import { Draw } from './Draw';
import { Explore } from './Explore';
import { Gate } from './Gate';
import { Lobby } from './Lobby';
import { Naming } from './Naming';
import { Record } from './Record';

export function Room({ code }: { code: string }) {
  const { code: joinedCode, status, view, enter } = useRoom();

  // 저장된 닉네임이 있으면 링크로 들어와도 바로 다시 입장한다 (재접속 복원)
  useEffect(() => {
    if (joinedCode !== code && nickname.get()) void enter(code, nickname.get());
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const inRoom = status === 'joined' && joinedCode === code && view?.code === code && view.players.some((p) => p.id === view.you);
  if (!inRoom) {
    if (status === 'joining' && joinedCode === code) return <p className="page caption">방에 들어가는 중이에요…</p>;
    return <Gate code={code} />;
  }

  const screen = (() => {
    switch (view.phase) {
      case 'LOBBY':
        return <Lobby view={view} />;
      case 'DRAW':
      case 'IMAGINE':
        return <Draw view={view} />;
      case 'NAMING':
        return <Naming view={view} />;
      case 'EXPLORE':
        return <Explore view={view} />;
      case 'CONNECT':
        return <Connect view={view} />;
      case 'RECORD':
        return <Record view={view} />;
      case 'DONE':
        return <Done view={view} />;
    }
  })();

  return (
    <>
      <div style={{ position: 'sticky', top: 0, zIndex: 30, padding: '0 var(--gutter)' }}>
        <OfflineBanner />
      </div>
      <div key={view.phase} className="fade">
        {screen}
      </div>
    </>
  );
}
