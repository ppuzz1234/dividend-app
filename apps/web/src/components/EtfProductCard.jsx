import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Landmark } from "lucide-react";
import { Plus200Logo } from "./ui/EtfLogos.jsx";
import styles from "./EtfProductCard.module.css";

const LOGOS = { plusSp500: Plus200Logo };
const pct = (r) => `${(r * 100).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}%`;
const dot = (iso) => iso.replace(/-/g, ".");

/* 자체 디자인 ⓘ 배지 — 폰트 아이콘 대신 앱 토큰(jade·card)으로 그린 SVG.
 * 다크 그라데이션 원판 + 상단 하이라이트 림 + jade 'i'(원형 점 + 라운드 스템) */
function InfoBadge({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="etfInfoBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--card-hi)" />
          <stop offset="1" stopColor="var(--bg2)" />
        </linearGradient>
        <linearGradient id="etfInfoRim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--line2)" />
          <stop offset="1" stopColor="var(--line)" />
        </linearGradient>
      </defs>
      {/* 원판 + 그라데이션 테두리 */}
      <circle cx="12" cy="12" r="10.9" fill="url(#etfInfoBg)" stroke="url(#etfInfoRim)" strokeWidth="1.2" />
      {/* 상단 하이라이트 — 눌리는 버튼 같은 입체감 */}
      <path d="M5.4 8.2a7.6 7.6 0 0 1 13.2 0" stroke="rgba(255,255,255,0.14)" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      {/* 'i' — 점 */}
      <circle cx="12" cy="7.4" r="1.65" fill="var(--jade)" />
      {/* 'i' — 스템 (위가 살짝 넓고 아래가 둥근 형태) */}
      <path
        d="M10.55 11.2c0-.72.62-1.3 1.45-1.3s1.45.58 1.45 1.3v5.1c0 .8-.65 1.45-1.45 1.45s-1.45-.65-1.45-1.45v-5.1z"
        fill="var(--jade)"
      />
    </svg>
  );
}

/* 문장 속 ETF명 옆에 붙이는 상세보기(i) 버튼.
 * 클릭 시 상세 레이어팝업(개요·스펙·배당 재투자 가정)을 띄운다.
 * 우상단 X / 백드롭 클릭 / ESC 로 닫기. */
export function EtfInfoButton({ etf }) {
  const Logo = LOGOS[etf.id];
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* ⓘ 상세보기 — 자체 디자인 SVG 배지, 프레스·호버 등 인터랙션은 토스풍 유지 */}
      <button
        type="button"
        className={styles.infoBtn}
        aria-label={`${etf.name} 상세 설명`}
        onClick={() => setOpen(true)}
      >
        <InfoBadge size={22} />
      </button>

      {/* 상세 모달 — 포털로 body에 직접 렌더: 등장 애니메이션(transform)이 걸린 조상 때문에
       * fixed 오버레이가 갇혀 페이지 콘텐츠에 겹치는 문제를 방지한다 */}
      {open && createPortal(
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div
            className={styles.popup}
            role="dialog"
            aria-modal="true"
            aria-label={`${etf.name} 상세 설명`}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className={styles.popupClose} aria-label="닫기" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>

            <div className={styles.popupHead}>
              <Logo size={34} />
              <div>
                <div className={styles.popupTitle}>{etf.name}</div>
                <div className={styles.popupSub}>{etf.manager}</div>
              </div>
            </div>

            <div className={styles.popupSection}>
              <div className={styles.popupSectionTitle}>개요</div>
              <p className={styles.popupDesc}>{etf.desc}</p>
              <dl className={styles.specList}>
                <div className={styles.specRow}>
                  <dt>운용사</dt>
                  <dd>{etf.manager}</dd>
                </div>
                <div className={styles.specRow}>
                  <dt>종목코드</dt>
                  <dd>{etf.ticker}</dd>
                </div>
                <div className={styles.specRow}>
                  <dt>설정일</dt>
                  <dd>{dot(etf.inceptionDate)}</dd>
                </div>
                <div className={styles.specRow}>
                  <dt>총보수</dt>
                  <dd>연 {pct(etf.expenseRatio)}</dd>
                </div>
                <div className={styles.specRow}>
                  <dt>참고 연환산 수익률</dt>
                  <dd>연 {pct(etf.cagrRef)}</dd>
                </div>
              </dl>
            </div>

            <div className={styles.popupSection}>
              <div className={styles.popupSectionTitle}>
                <Landmark size={12} /> 배당 재투자 가정
              </div>
              <p className={styles.popupDesc}>
                월 불입금은 배당금을 전액 재투자한다는 가정으로 역산한 값이에요. 과거 수익률 기준의 예시로,
                향후 동일한 수익을 보장하지 않아요.
              </p>
              <p className={styles.popupNote}>{etf.sourceNote}</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
