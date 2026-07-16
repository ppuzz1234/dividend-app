/* GENIUS 브랜드 마크 — 비비드 옐로우 스퀘어클 + 다크 도넛(ETF 파이, 한 조각 오픈).
   public/brand/app-icon.svg(G2)과 동일한 마크. size 로 크기, glow=true 면 은은한 발광. */
export default function BrandMark({ size = 40, glow = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      style={glow ? { filter: "drop-shadow(0 0 14px rgba(255,207,36,.5))" } : undefined}
    >
      <rect width="48" height="48" rx="11" fill="#FFCF24" />
      <circle
        cx="24"
        cy="24"
        r="11.8"
        fill="none"
        stroke="#1A1400"
        strokeWidth="8.1"
        pathLength="100"
        strokeDasharray="86 14"
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
}
