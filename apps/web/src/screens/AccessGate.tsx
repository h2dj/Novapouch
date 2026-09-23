import { useState } from 'react';
import { useConfig } from '../lib/config';
import { connectSocket } from '../lib/room';

/** 내부 테스트 서버: 접근 코드를 아는 사람만 들어온다. 초대 링크로 오면 이 화면을 건너뛴다 */
export function AccessGate() {
  const { brand, setAccessCode } = useConfig();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await setAccessCode(code);
    setBusy(false);
    if (ok) connectSocket();
    else setError('코드가 맞지 않아요. 모임을 연 사람에게 다시 확인해 주세요.');
  };

  return (
    <div className="page">
      <header className="topbar">
        <span className="brand">{brand}</span>
      </header>
      <main className="stack" style={{ '--gap': '24px', maxWidth: 440, width: '100%', margin: '0 auto', paddingTop: '10vh' } as React.CSSProperties}>
        <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <span className="eyebrow">INVITE ONLY</span>
          <h1 className="display">초대받은 사람만 들어올 수 있어요</h1>
          <p className="muted">받은 초대 링크로 들어오거나, 모임에서 알려 준 접근 코드를 적어 주세요.</p>
        </div>
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label className="field__label" htmlFor="access">
              접근 코드
            </label>
            <input id="access" className="input" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="caption" style={{ color: 'var(--rose)' }}>
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn--primary" disabled={!code.trim() || busy} aria-busy={busy}>
            들어가기
          </button>
        </form>
      </main>
    </div>
  );
}
