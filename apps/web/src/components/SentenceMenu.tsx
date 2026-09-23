import type { GameView, ViewContribution } from '@novapouch/game-core';
import { useState } from 'react';
import { useRoom } from '../lib/room';
import { Icon } from './Icon';
import { Modal } from './Modal';

const REASONS = ['모욕하거나 괴롭히는 표현', '혐오나 차별 표현', '개인정보 노출', '도배나 광고', '기타'];

/** 문장을 눌렀을 때: 방장은 숨기기, 누구나 신고·차단 */
export function SentenceMenu({ view, contribution, onClose }: { view: GameView; contribution: ViewContribution; onClose: () => void }) {
  const { act, report, block } = useRoom.getState();
  const [mode, setMode] = useState<'menu' | 'report'>('menu');
  const [reason, setReason] = useState(REASONS[0]!);
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const author = view.players.find((p) => p.id === contribution.playerId)?.nickname ?? '떠난 탐사자';
  const isHost = view.hostId === view.you;
  const isMine = contribution.playerId === view.you;
  const blocked = view.blockedIds.includes(contribution.playerId);
  const where = contribution.round ? `${contribution.round}라운드` : '연결 단계 제안';
  const shown = contribution.text ?? (contribution.masked === 'blocked' ? '차단한 사람의 문장' : '가려진 문장');

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) onClose();
  };

  if (mode === 'report') {
    return (
      <Modal labelledBy="report-title" onClose={onClose}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="report-title" className="title">
            이 문장 신고하기
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>
        <blockquote className="quote">
          <span>{shown}</span>
          <span className="caption">
            {author} · {where}
          </span>
        </blockquote>
        <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
          <legend className="field__label" style={{ marginBottom: 6 }}>
            어떤 문제가 있나요?
          </legend>
          {REASONS.map((r) => (
            <label key={r} className="option">
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} style={{ accentColor: 'var(--rose)' }} />
              {r}
            </label>
          ))}
        </fieldset>
        {reason === '기타' ? (
          <div className="field">
            <label className="field__label" htmlFor="report-detail">
              자세한 내용 (선택)
            </label>
            <textarea id="report-detail" className="textarea" rows={2} maxLength={300} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </div>
        ) : null}
        {!blocked ? (
          <label className="option card card--quiet" style={{ padding: '12px 14px', alignItems: 'flex-start', borderRadius: 12 }}>
            <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} style={{ accentColor: 'var(--rose)', marginTop: 3 }} />
            <span className="stack" style={{ '--gap': '2px' } as React.CSSProperties}>
              <span style={{ fontWeight: 500 }}>{author} 님 차단하기</span>
              <span className="caption">서로의 문장이 가려지고, 같은 방에 다시 들어오면 알려 드려요.</span>
            </span>
          </label>
        ) : null}
        <p className="caption row" style={{ alignItems: 'flex-start', gap: 8 }}>
          <Icon name="lock" size={16} />
          신고한 사람은 공개되지 않아요. 방장에게는 숨김 요청으로, 운영팀에는 검토 요청으로 전달돼요.
        </p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy}
            onClick={() => run(() => report({ contributionId: contribution.id, reason, detail, block: alsoBlock }))}
          >
            신고 보내기
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal labelledBy="menu-title" onClose={onClose} sheet>
      <h2 id="menu-title" className="caption" style={{ letterSpacing: '0.1em' }}>
        문장 관리
      </h2>
      <blockquote className="quote">
        <span>{shown}</span>
        <span className="caption">
          {author} · {where}
          {contribution.flagged ? ' · 금칙어 포함' : ''}
        </span>
      </blockquote>
      {isHost ? (
        <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
          <span className="caption" style={{ color: 'var(--gold)' }}>
            방장 도구
          </span>
          <button
            type="button"
            className="btn"
            style={{ justifyContent: 'flex-start', minHeight: 60, textAlign: 'left', background: 'var(--surface-2)' }}
            disabled={busy}
            onClick={() => run(() => act({ type: 'HIDE', contributionId: contribution.id, hidden: !contribution.hidden }))}
          >
            <Icon name={contribution.hidden ? 'eye' : 'eyeOff'} color="var(--gold)" />
            <span className="stack" style={{ '--gap': '2px' } as React.CSSProperties}>
              <span>{contribution.hidden ? '숨김 풀기' : '이 문장 숨기기'}</span>
              <span className="caption">
                {contribution.hidden ? '모두의 화면에 다시 보여요' : '모두의 화면에서 가려지고 세계 기록에 남지 않아요'}
              </span>
            </span>
          </button>
        </div>
      ) : null}
      {!isMine ? (
        <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
          <button type="button" className="btn btn--ghost" style={{ justifyContent: 'flex-start', color: 'var(--text)' }} onClick={() => setMode('report')}>
            <Icon name="flag" color="var(--rose)" />
            신고하기
          </button>
          {!blocked ? (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ justifyContent: 'flex-start', color: 'var(--text)', minHeight: 56 }}
              disabled={busy}
              onClick={() => run(() => block(contribution.playerId))}
            >
              <Icon name="block" color="var(--rose)" />
              <span className="stack" style={{ '--gap': '2px', textAlign: 'left' } as React.CSSProperties}>
                <span>{author} 님 차단하기</span>
                <span className="caption">내 화면에서 이 사람의 문장이 가려져요</span>
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
      <button type="button" className="btn btn--block" onClick={onClose}>
        닫기
      </button>
    </Modal>
  );
}
