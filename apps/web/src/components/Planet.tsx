import { useId } from 'react';

const PALETTE = ['#78C7C5', '#A995D6', '#7FA6C9', '#D8CDF2', '#E6C890'];

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 같은 속성 토큰이면 같은 빛 */
export function attributeColor(attributeId: string): string {
  return PALETTE[hash(attributeId) % PALETTE.length]!;
}

/**
 * 토큰 조합에서 결정적으로 그려지는 행성 표지.
 * 색은 속성 토큰, 구멍·고리 배치는 사물 토큰에서 나온다.
 */
export function Planet({ objectId, attributeId, size = 120, title }: { objectId: string; attributeId: string; size?: number; title?: string }) {
  const gid = useId().replace(/:/g, '');
  const color = attributeColor(attributeId);
  const h = hash(objectId);
  const craters = Array.from({ length: 4 + (h % 3) }, (_, i) => {
    const a = ((h >>> (i * 3)) % 360) * (Math.PI / 180);
    const r = 12 + ((h >>> (i * 5)) % 22);
    return { cx: 60 + Math.cos(a) * r, cy: 60 + Math.sin(a) * r, r: 2.5 + ((h >>> (i * 7)) % 5) };
  });
  const tilt = (h % 50) - 25;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <radialGradient id={`g${gid}`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="55%" stopColor="#20304A" />
          <stop offset="100%" stopColor="#0D1727" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="42" fill={`url(#g${gid})`} stroke={color} strokeWidth="1.1" />
      <circle cx="60" cy="60" r="42" fill="none" stroke="#D8CDF2" strokeOpacity="0.35" strokeDasharray="2 6" />
      {craters.map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke="#D8CDF2" strokeOpacity="0.8" />
      ))}
      <ellipse cx="60" cy="60" rx="57" ry="13" fill="none" stroke="#E6C890" strokeWidth="0.9" strokeOpacity="0.75" transform={`rotate(${tilt} 60 60)`} />
    </svg>
  );
}
