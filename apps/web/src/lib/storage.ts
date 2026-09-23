// 사생활 보호 모드 등에서 localStorage가 막혀 있어도 앱이 멈추지 않게 감싼다
export function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 저장하지 못해도 이번 세션은 계속 진행한다 */
  }
}

let memoryToken: string | null = null;

/** 익명 기기 토큰. 재접속 때 같은 탐사자로 복원하는 데 쓴다 */
export function deviceToken(): string {
  const stored = load('np.device');
  if (stored) return stored;
  if (!memoryToken) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    memoryToken = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    save('np.device', memoryToken);
  }
  return memoryToken;
}

export const nickname = {
  get: () => load('np.nickname') ?? '',
  set: (v: string) => save('np.nickname', v.trim()),
};
