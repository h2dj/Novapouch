import { useState } from 'react';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { DEFAULT_BRAND, useConfig } from '../lib/config';
import { usePrefs } from '../lib/prefs';
import { navigate } from '../lib/router';
import { PouchArt } from '../components/Pouch';

export function Home() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { motion, setMotion } = usePrefs();
  const brand = useConfig((s) => s.brand);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { code } = await api.createRoom();
      navigate(`/r/${code}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length < 4) return setError('초대 코드 4자리를 적어 주세요.');
    try {
      await api.room(c);
      navigate(`/r/${c}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="home">
      <div className="home__bg" aria-hidden="true" />
      <div className="page">
        <header className="topbar">
          <span className="brand">{brand}</span>
          <nav aria-label="주요 메뉴" className="row" style={{ gap: 4 }}>
            <a className="btn btn--ghost" href="/nebula" onClick={(e) => (e.preventDefault(), navigate('/nebula'))}>
              성운 기록
            </a>
          </nav>
        </header>

        <main className="home__main">
          <section className="stack home__copy" style={{ '--gap': '16px' } as React.CSSProperties}>
            <span className="eyebrow">두 개의 파우치, 하나의 세계</span>
            <h1 className="display home__title">
              오늘은 어떤 세계를
              <br />
              발견할까요
            </h1>
            <p className="muted">
              두 개의 파우치에서 토큰을 뽑고
              <br />
              친구들과 한 문장씩 세계를 이어갑니다
            </p>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="chip chip--teal">2~6명</span>
              <span className="chip chip--violet">15~30분</span>
              <span className="chip chip--gold">링크 초대</span>
            </div>
          </section>

          <div className="home__pouches" aria-hidden="true">
            <div className="drift">
              <PouchArt kind="A" size={120} />
              <span className="caption">사물</span>
            </div>
            <div className="drift" style={{ animationDelay: '-2.4s' }}>
              <PouchArt kind="B" size={120} />
              <span className="caption">속성</span>
            </div>
          </div>

          <section className="stack home__actions" style={{ '--gap': '12px' } as React.CSSProperties}>
            <button type="button" className="btn btn--primary btn--block" onClick={create} aria-busy={busy} disabled={busy}>
              새 세계 발견
            </button>
            <form className="row" style={{ gap: 8 }} onSubmit={join}>
              <label htmlFor="code" className="sr-only">
                초대 코드
              </label>
              <input
                id="code"
                className="input grow"
                placeholder="초대 코드 입력"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                style={{ letterSpacing: code ? '0.2em' : undefined, textTransform: 'uppercase' }}
              />
              <button type="submit" className="btn" style={{ minHeight: 52 }}>
                들어가기
              </button>
            </form>
            {error ? (
              <p role="alert" className="caption" style={{ color: 'var(--rose)' }}>
                {error}
              </p>
            ) : null}
          </section>
        </main>

        <footer className="row wrap caption" style={{ justifyContent: 'space-between', gap: 12 }}>
          {/* 작품 이름은 정식 협업 전까지 내부 빌드에서만 보인다 */}
          <span>{brand === DEFAULT_BRAND ? '내부 독서모임용 프로토타입 · 김초엽 「비구름을 따라서」의 상상 놀이에서 출발했어요' : '함께 상상하는 협력형 스토리 게임'}</span>
          <label className="row" style={{ gap: 8, minHeight: 44, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={motion === 'reduced'}
              onChange={(e) => setMotion(e.target.checked ? 'reduced' : 'system')}
              style={{ width: 18, height: 18, accentColor: 'var(--glow-teal)' }}
            />
            <Icon name="sparkle" size={16} />
            움직임 줄이기
          </label>
        </footer>
      </div>
    </div>
  );
}
