import type { GameView, ViewContribution } from '@novapouch/game-core';
import { getQuestion, categoryLabels } from '@novapouch/content';
import { useState } from 'react';
import { Avatar } from './bits';
import { Icon } from './Icon';
import { SentenceMenu } from './SentenceMenu';

const MASK_TEXT: Record<NonNullable<ViewContribution['masked']>, string> = {
  quiet: '제출했어요 · 라운드가 끝나면 보여요',
  hidden: '방장이 숨긴 문장이에요',
  blocked: '차단한 사람의 문장이에요',
};

/** 탐사 테이블의 세계 조각 한 줄 */
export function Fragment({ view, c, showQuestion }: { view: GameView; c: ViewContribution; showQuestion?: boolean }) {
  const [menu, setMenu] = useState(false);
  const author = view.players.find((p) => p.id === c.playerId)?.nickname ?? '떠난 탐사자';
  const mine = c.playerId === view.you;
  const q = getQuestion(c.questionId ?? undefined);
  const hiddenForHost = c.hidden && c.text !== null;
  const cls = c.masked ? 'fragment--masked' : mine ? 'fragment--mine' : c.flagged ? 'fragment--flagged' : '';
  const canManage = c.masked !== 'quiet' && (view.hostId === view.you || !mine);

  return (
    <li className={`fragment ${cls} enter`} style={hiddenForHost ? { opacity: 0.55 } : undefined}>
      <Avatar view={view} playerId={c.playerId} name={author} small />
      <div className="fragment__body">
        {c.masked ? (
          <span className="row" style={{ gap: 6 }}>
            {c.masked !== 'quiet' ? <Icon name="eyeOff" size={16} /> : null}
            {MASK_TEXT[c.masked]}
          </span>
        ) : (
          <span>{c.text}</span>
        )}
        <span className="fragment__meta">
          <span>
            {author}
            {mine ? ' (나)' : ''}
          </span>
          {showQuestion && q ? <span>· {categoryLabels[q.category]} 질문</span> : null}
          {c.round ? <span>· {c.round}라운드</span> : <span>· 직접 제안</span>}
          {c.fromChoice ? <span className="chip">선택지</span> : null}
          {hiddenForHost ? <span className="chip chip--gold">숨김</span> : null}
          {c.flagged && !c.masked ? <span className="chip chip--rose">확인 필요</span> : null}
        </span>
      </div>
      {canManage ? (
        <button type="button" className="icon-btn" onClick={() => setMenu(true)} aria-label={`${author} 님 문장 관리`}>
          <Icon name="more" />
        </button>
      ) : null}
      {menu ? <SentenceMenu view={view} contribution={c} onClose={() => setMenu(false)} /> : null}
    </li>
  );
}
