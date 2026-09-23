import { create } from 'zustand';
import { load, save } from './storage';

type Motion = 'system' | 'reduced' | 'full';

function applyMotion(m: Motion) {
  if (m === 'system') delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = m;
}

const initial = (load('np.motion') as Motion | null) ?? 'system';
applyMotion(initial);

export const usePrefs = create<{ motion: Motion; setMotion: (m: Motion) => void }>((set) => ({
  motion: initial,
  setMotion: (motion) => {
    save('np.motion', motion);
    applyMotion(motion);
    set({ motion });
  },
}));

export function prefersReducedMotion(): boolean {
  const m = usePrefs.getState().motion;
  if (m !== 'system') return m === 'reduced';
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
