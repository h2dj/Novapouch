// 금칙어 보조 탐지용 초기 목록. 차단이 아니라 제출 전 경고와 방장 표시에만 쓴다.
const WORDS = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새끼', '좆', '존나', '꺼져', '닥쳐', '미친놈', '미친년', '죽어라'];

const normalize = (text: string) => text.replace(/[\s.\-_*~!?]/g, '').toLowerCase();

export function findBlockedWords(text: string): string[] {
  const n = normalize(text);
  return WORDS.filter((w) => n.includes(w));
}
