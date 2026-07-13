/* GENIUS 브랜드 마크 — 황금돼지 + 달러 코인.
   배당·재물을 상징하는 '황금돼지'가 욕망에 눈을 반짝이는(별 모양 글린트) 모습에,
   예전 '배당눈덩이' 시절처럼 골드 달러 코인 배지를 함께 얹었다.
   옐로우(골드) 테마에 맞춘 웜톤 팔레트. size 로 크기, glow=true 면 은은한 발광. */
export default function BrandMark({ size = 40, glow = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      style={glow ? { filter: "drop-shadow(0 0 14px rgba(242,194,48,.55))" } : undefined}
    >
      <defs>
        <linearGradient id="cl-pig" x1="10" y1="8" x2="34" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F8D268" />
          <stop offset="55%" stopColor="#EDB63F" />
          <stop offset="100%" stopColor="#DA9E30" />
        </linearGradient>
        <radialGradient id="cl-coin" cx="0.38" cy="0.34" r="0.75">
          <stop offset="0%" stopColor="#F9D667" />
          <stop offset="100%" stopColor="#CB962A" />
        </radialGradient>
        <filter id="cl-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.1" floodColor="#FFE7A6" floodOpacity="0.95" />
        </filter>
      </defs>

      {/* 귀 */}
      <path d="M11 15 C8.5 7.5 14.5 7 16.2 13.2 Z" fill="url(#cl-pig)" />
      <path d="M31 15 C33.5 7.5 27.5 7 25.8 13.2 Z" fill="url(#cl-pig)" />
      <path d="M12.6 13.6 C11.4 9.8 14.3 9.6 15.2 12.9 Z" fill="#B9822F" opacity="0.7" />
      <path d="M29.4 13.6 C30.6 9.8 27.7 9.6 26.8 12.9 Z" fill="#B9822F" opacity="0.7" />

      {/* 머리 */}
      <ellipse cx="21" cy="24" rx="15.4" ry="13.4" fill="url(#cl-pig)" stroke="#C88E2A" strokeWidth="0.8" />

      {/* 별 모양으로 반짝이는 눈 (욕망 글린트) */}
      <g filter="url(#cl-glow)" fill="#FFF6DA">
        <path d="M15.4 17.6 Q16.2 20.8 19.4 21.6 Q16.2 22.4 15.4 25.6 Q14.6 22.4 11.4 21.6 Q14.6 20.8 15.4 17.6 Z" />
        <path d="M26.6 17.6 Q27.4 20.8 30.6 21.6 Q27.4 22.4 26.6 25.6 Q25.8 22.4 22.6 21.6 Q25.8 20.8 26.6 17.6 Z" />
      </g>
      {/* 눈 중심 하이라이트 */}
      <circle cx="15.4" cy="21.6" r="1" fill="#FFFDF4" />
      <circle cx="26.6" cy="21.6" r="1" fill="#FFFDF4" />

      {/* 코(주둥이) */}
      <ellipse cx="21" cy="28.6" rx="6.6" ry="5" fill="#C9993E" stroke="#B07E2A" strokeWidth="0.7" />
      <ellipse cx="18.6" cy="28.8" rx="1.15" ry="1.7" fill="#3A2B08" />
      <ellipse cx="23.4" cy="28.8" rx="1.15" ry="1.7" fill="#3A2B08" />

      {/* 골드 달러 코인 배지 */}
      <circle cx="37" cy="35" r="8.6" fill="url(#cl-coin)" stroke="#B9822F" strokeWidth="1.1" />
      <circle cx="37" cy="35" r="6.4" fill="none" stroke="#E9C878" strokeWidth="0.7" opacity="0.6" />
      <g stroke="#3A2B08" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M37 29.9 V40.1" />
        <path d="M39.7 32 C39.7 30.8 38.5 30.2 37 30.2 C35.3 30.2 34.2 31 34.2 32.2 C34.2 33.4 35.4 33.8 37 34.2 C38.7 34.6 40 35.1 40 36.5 C40 37.8 38.7 38.6 37 38.6 C35.4 38.6 34.2 38 34.2 36.7" />
      </g>
    </svg>
  );
}
