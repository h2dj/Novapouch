/** 천으로 된 파우치. A는 남청, B는 자줏빛 */
export function PouchArt({ kind, size = 132 }: { kind: 'A' | 'B'; size?: number }) {
  const fill = kind === 'A' ? '#1d2a47' : '#3a2c4d';
  const edge = kind === 'A' ? '#78C7C5' : '#A995D6';
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path d="M26 46c0-8 15-13 34-13s34 5 34 13l-6 50c-2 10-14 14-28 14s-26-4-28-14z" fill={fill} stroke={edge} strokeWidth="1.4" />
      <path d="M28 47c8 7 56 7 64 0" fill="none" stroke={edge} strokeOpacity="0.8" strokeWidth="1.2" strokeDasharray="3 4" />
      <path d="M38 40c6-10 38-10 44 0" fill="none" stroke="#E6C890" strokeOpacity="0.5" strokeWidth="1" />
      <path d="M52 50c-6 6-10 14-8 22" fill="none" stroke="#C9A96E" strokeWidth="1.6" />
      <path d="M68 50c6 6 10 14 8 22" fill="none" stroke="#C9A96E" strokeWidth="1.6" />
      {kind === 'A' ? (
        <g stroke="#E6C890" strokeOpacity="0.8" fill="none" strokeWidth="1">
          <path d="M60 94V74" />
          <path d="M60 80l-7-6M60 80l7-6M60 87l-8-5M60 87l8-5" />
        </g>
      ) : (
        <g stroke="#E6C890" strokeOpacity="0.8" fill="none" strokeWidth="1">
          <circle cx="60" cy="82" r="11" />
          <path d="M60 68v28M46 82h28" />
        </g>
      )}
      <text x="60" y="30" textAnchor="middle" fontSize="14" fontWeight="700" fill={edge}>
        {kind}
      </text>
    </svg>
  );
}
