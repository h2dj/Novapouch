import { create } from 'zustand';
import { load, save } from './storage';

export const DEFAULT_BRAND = 'NOVA POUCH';

/** 초대 링크의 ?k= 로 받은 접근 코드를 저장하고 주소에서 지운다 */
function takeAccessFromUrl() {
  const url = new URL(location.href);
  const k = url.searchParams.get('k');
  if (!k) return;
  save('np.access', k);
  url.searchParams.delete('k');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}
takeAccessFromUrl();

export const accessCode = () => load('np.access') ?? '';

interface ConfigStore {
  loaded: boolean;
  brand: string;
  accessRequired: boolean;
  accessOk: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setAccessCode: (code: string) => Promise<boolean>;
}

export const useConfig = create<ConfigStore>((set, get) => ({
  loaded: false,
  brand: DEFAULT_BRAND,
  accessRequired: false,
  accessOk: true,
  error: null,
  refresh: async () => {
    try {
      const res = await fetch('/api/config', { headers: { 'x-access-code': accessCode() } });
      const c = (await res.json()) as { brand: string; accessRequired: boolean; accessOk: boolean };
      document.title = c.brand;
      set({ ...c, loaded: true, error: null });
    } catch {
      set({ loaded: true, error: '서버와 연결하지 못했어요. 잠시 후 다시 열어 주세요.' });
    }
  },
  setAccessCode: async (code) => {
    save('np.access', code.trim());
    await get().refresh();
    return get().accessOk;
  },
}));

/** 초대 링크. 접근 코드가 필요한 서버면 코드를 함께 담아 받는 사람이 바로 들어오게 한다 */
export function inviteLink(roomCode: string): string {
  const base = `${location.origin}/r/${roomCode}`;
  const { accessRequired } = useConfig.getState();
  return accessRequired && accessCode() ? `${base}?k=${encodeURIComponent(accessCode())}` : base;
}
