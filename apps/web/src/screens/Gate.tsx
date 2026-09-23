import { useState } from 'react';
import { TopBar } from '../components/bits';
import { useRoom } from '../lib/room';
import { navigate } from '../lib/router';
import { nickname as saved } from '../lib/storage';

/** 방에 들어가기 전에 닉네임을 정한다. 익명으로 충분하다 */
export function Gate({ code }: { code: string }) {
  const [name, setName] = useState(saved.get());
  const { enter, status, error } = useRoom();
  const busy = status === 'joining';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await enter(code, name.trim());
  };

  return (
    <div className="page">
      <TopBar crumb={`방 ${code}`} onBack={() => navigate('/')} />
      <main className="stack" style={{ '--gap': '24px', maxWidth: 440, width: '100%', margin: '0 auto', paddingTop: '8vh' } as React.CSSProperties}>
        <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <span className="eyebrow">초대 코드 {code}</span>
          <h1 className="display">어떤 이름으로 탐사할까요</h1>
          <p className="muted">실명이 아니어도 괜찮아요. 함께 만든 세계에 이 이름이 남아요.</p>
        </div>
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label className="field__label" htmlFor="nickname">
              닉네임
            </label>
            <input
              id="nickname"
              className="input"
              maxLength={12}
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 은서"
            />
          </div>
          {error ? (
            <p role="alert" className="caption" style={{ color: 'var(--rose)' }}>
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn--primary" disabled={!name.trim() || busy} aria-busy={busy}>
            방에 들어가기
          </button>
        </form>
      </main>
    </div>
  );
}
