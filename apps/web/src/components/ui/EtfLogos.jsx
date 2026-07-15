/* ETF 브랜드 BI — 정사각형 타일.
 * 실제 로고 이미지를 그대로 쓰는 대신, 동일한 컬러·구성요소(워드마크/기호)를
 * 살린 인라인 SVG 로 재구성했다 (에셋 없이 어떤 배경에도 선명하게 렌더링). */

/* 한화자산운용 PLUS ETF — 실제 BI 이미지 사용.
 * plus-etf-large.png 는 원본(plus-etf.png 32px)을 임계처리 후 니어리스트로
 * 16배 확대한 512px 판 — 큰 사이즈에서도 흐려짐·프린지 없이 선명. */
export function Plus200Logo({ size = 40 }) {
  return (
    <img
      src="/logo-black.svg"
      width={size}
      height={size}
      alt="PLUS ETF"
      style={{ display: "block", objectFit: "contain", filter: "brightness(0) invert(1)" }}
    />
  );
}

/* iShares by BlackRock — 흰 배경 JPG 워드마크.
 * invert + screen 블렌드로 배경(→검정)은 다크 테마에 녹이고 글자만 흰색으로 표시. */
export function ToptLogo({ size = 40 }) {
  return (
    <img
      src="/ishares.jpg"
      width={size}
      height={size}
      alt="TOPT ETF"
      style={{
        display: "block",
        objectFit: "contain",
        filter: "invert(1)",
        mixBlendMode: "screen",
      }}
    />
  );
}
