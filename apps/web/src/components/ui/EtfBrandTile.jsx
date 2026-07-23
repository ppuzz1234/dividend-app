import styles from "./EtfBrandTile.module.css";

/* ETF 브랜드 타일 — 상품명 앞 브랜드(TIGER·KODEX 등)를 브랜드 컬러 타일로 표시.
 * 로고 에셋 없이 워드마크형 모노그램으로 렌더링한다(어느 배경에서도 선명). */
const BRANDS = {
  KIWOOM: { bg: "#8e2f3c", fg: "#f6efe9" }, // 키움 버건디
  TIGER: { bg: "#e8672b", fg: "#fdf3ec" }, // 미래에셋 오렌지
  KODEX: { bg: "#1f4fbf", fg: "#eef2fc" }, // 삼성 블루
  ACE: { bg: "#0f7a6c", fg: "#eaf6f3" }, // 한국투자 그린
  PLUS: { bg: "#f2c21d", fg: "#17150f" }, // 한화 옐로우(브랜드)
};
const FALLBACK = { bg: "#39453e", fg: "#eaf1ec" };

export function EtfBrandTile({ name = "", size = 34 }) {
  const brand = name.split(" ")[0].toUpperCase();
  const c = BRANDS[brand] || FALLBACK;
  return (
    <span
      className={styles.tile}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: c.bg,
        color: c.fg,
        fontSize: Math.max(6, Math.round(size * 0.19)),
      }}
    >
      {brand.slice(0, 6)}
    </span>
  );
}
