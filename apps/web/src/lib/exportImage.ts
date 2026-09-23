import { toBlob } from 'html-to-image';

/** 세계 요약 카드를 PNG로 저장한다. 글꼴은 같은 출처에서 불러오므로 그대로 담긴다 */
export async function exportImage(node: HTMLElement, name: string) {
  const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#0A1220', cacheBust: true });
  if (!blob) throw new Error('이미지를 만들지 못했어요.');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[\\/:*?"<>|]/g, '').trim() || 'nova-pouch'}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
