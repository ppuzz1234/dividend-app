/* PLUS CUBE 브랜드 마크 — 3x3 큐브 타일이 "C" 자를 이루는 형태.
   public/brand/app-icon.svg · favicon.svg 와 동일한 마크
   (큐브 85% 축소 · C 의 열린 공간은 외곽선 타일).
   size 로 크기, glow=true 면 은은한 발광. */
const DARK = [
  [46, 46], [190, 46], [334, 46],
  [46, 190],
  [46, 334], [190, 334], [334, 334],
];
const COUNTER = [195, 339]; // 카운터 타일 x 좌표 (y 는 195 고정)

export default function BrandMark({ size = 40, glow = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
      style={glow ? { filter: "drop-shadow(0 0 14px rgba(242,194,29,.5))" } : undefined}
    >
      <rect width="512" height="512" rx="118" fill="#F2C21D" />
      <g transform="translate(256 256) scale(0.765) translate(-256 -256)">
        <g fill="#17150F">
          {DARK.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="132" height="132" rx="26" />
          ))}
        </g>
        <g fill="none" stroke="#17150F" strokeWidth="10">
          {COUNTER.map((x) => (
            <rect key={x} x={x} y="195" width="122" height="122" rx="23" />
          ))}
        </g>
      </g>
    </svg>
  );
}
