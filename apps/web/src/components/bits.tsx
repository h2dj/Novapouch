import type { Token } from '@novapouch/content';
import type { GameView } from '@novapouch/game-core';
import type { ReactNode } from 'react';
import { avatarColor, formatSeconds, useRemaining } from '../lib/hooks';
import { useConfig } from '../lib/config';
import { navigate } from '../lib/router';
import { useRoom } from '../lib/room';
import { Icon } from './Icon';

export function Avatar({ view, playerId, name, small }: { view: GameView | null; playerId: string; name: string; small?: boolean }) {
  return (
    <span className={`avatar${small ? ' avatar--sm' : ''}`} style={{ background: avatarColor(view, playerId) }} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}

export function TokenPair({ object, attribute, large }: { object?: Token; attribute?: Token; large?: boolean }) {
  return (
    <div className="token-pair" style={large ? { gridTemplateColumns: '1fr' } : undefined}>
      <div className="token token--object">
        <span className="token__kind">A 사물</span>
        <span className="token__label" style={large ? { fontSize: 30 } : undefined}>
          {object?.label ?? '?'}
        </span>
      </div>
      <div className="token token--attribute">
        <span className="token__kind">B 속성</span>
        <span className="token__label" style={large ? { fontSize: 24 } : undefined}>
          {attribute?.label ?? '?'}
        </span>
      </div>
    </div>
  );
}

export function Timer({ deadlineAt, label = '남은 시간' }: { deadlineAt: number | null; label?: string }) {
  const sec = useRemaining(deadlineAt);
  if (sec === null) return null;
  const urgent = sec <= 10;
  return (
    <span role="timer" aria-live={urgent ? 'polite' : 'off'} className={`pill-timer${urgent ? ' pill-timer--urgent' : ''}`}>
      <Icon name="clock" size={16} color={urgent ? 'var(--rose)' : 'var(--glow-teal)'} />
      <span className="sr-only">{label}</span>
      <strong>{formatSeconds(sec)}</strong>
    </span>
  );
}

export function TopBar({ crumb, right, onBack }: { crumb: string; right?: ReactNode; onBack?: () => void }) {
  const brand = useConfig((s) => s.brand);
  return (
    <header className="topbar">
      <div className="topbar__left">
        {onBack ? (
          <button type="button" className="icon-btn" onClick={onBack} aria-label="뒤로">
            <Icon name="back" size={22} />
          </button>
        ) : null}
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          {brand}
        </a>
        <span className="crumb">{crumb}</span>
      </div>
      {right ? <div className="row" style={{ gap: 8 }}>{right}</div> : null}
    </header>
  );
}

export function Toasts() {
  const toasts = useRoom((s) => s.toasts);
  const dismiss = useRoom((s) => s.dismiss);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={t.tone === 'error' ? { borderColor: 'var(--rose)' } : undefined}>
          <span className="grow">{t.message}</span>
          <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => dismiss(t.id)} aria-label="알림 닫기">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function OfflineBanner() {
  const online = useRoom((s) => s.online);
  if (online) return null;
  return (
    <div className="banner" role="alert">
      연결이 잠시 끊겼어요. 다시 연결하는 중이에요. 쓰던 문장은 저장돼 있어요.
    </div>
  );
}
