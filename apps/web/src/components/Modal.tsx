import { useEffect, useRef, type ReactNode } from 'react';

/** 대화상자. 모바일에서는 아래에서 올라오는 시트로 보인다 */
export function Modal({ labelledBy, onClose, children, sheet }: { labelledBy: string; onClose: () => void; children: ReactNode; sheet?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('button, input, textarea, [href]');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, [href]')];
        if (!items.length) return;
        const [head, tail] = [items[0]!, items[items.length - 1]!];
        if (e.shiftKey && document.activeElement === head) {
          e.preventDefault();
          tail.focus();
        } else if (!e.shiftKey && document.activeElement === tail) {
          e.preventDefault();
          head.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={`backdrop${sheet ? ' backdrop--sheet' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}
