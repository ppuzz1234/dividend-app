/* ETF 브랜드 BI — 정사각형 타일.
 * 실제 로고 이미지를 그대로 쓰는 대신, 동일한 컬러·구성요소(워드마크/기호)를
 * 살린 인라인 SVG 로 재구성했다 (에셋 없이 어떤 배경에도 선명하게 렌더링). */

/* 한화자산운용 PLUS ETF — 블랙 바탕 + 화이트 플러스(교차) 심볼 */
export function Plus200Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect width="64" height="64" rx={size * 0.22} fill="#0A0A0A" />
      <path
        d="M18 18H30V26H38V18H50V30H42V38H50V50H38V42H30V50H18V38H26V30H18Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/* iShares by BlackRock — 그린 그라디언트 정사각형 + iShares 워드마크 */
export function ToptLogo({ size = 40 }) {
  const r = size * 0.22;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ishares-bg" x1="4" y1="6" x2="60" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C4D82E" />
          <stop offset="55%" stopColor="#5A8F3C" />
          <stop offset="100%" stopColor="#2F5B33" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx={r} fill="url(#ishares-bg)" />
      <circle cx="17" cy="26" r="2.6" fill="#FFFFFF" />
      <rect x="14.6" y="31" width="4.8" height="15" rx="2.2" fill="#FFFFFF" />
      <text
        x="24.5"
        y="41.5"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="15.5"
        fontStyle="italic"
        fontWeight="700"
        fill="#FFFFFF"
      >
        Shares
      </text>
    </svg>
  );
}
