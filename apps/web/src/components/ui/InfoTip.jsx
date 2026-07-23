import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./InfoTip.module.css";

/* 자체 디자인 ⓘ 배지 — 앱 토큰(jade·card)으로 그린 SVG (EtfInfoButton 과 동일 계열).
 * gradient id 는 InfoTip 전용으로 분리해 다른 배지와 충돌하지 않게 한다. */
function InfoBadge({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="itInfoBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--card-hi)" />
          <stop offset="1" stopColor="var(--bg2)" />
        </linearGradient>
        <linearGradient id="itInfoRim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--line2)" />
          <stop offset="1" stopColor="var(--line)" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10.9" fill="url(#itInfoBg)" stroke="url(#itInfoRim)" strokeWidth="1.2" />
      <path d="M5.4 8.2a7.6 7.6 0 0 1 13.2 0" stroke="rgba(255,255,255,0.14)" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="7.4" r="1.65" fill="var(--jade)" />
      <path
        d="M10.55 11.2c0-.72.62-1.3 1.45-1.3s1.45.58 1.45 1.3v5.1c0 .8-.65 1.45-1.45 1.45s-1.45-.65-1.45-1.45v-5.1z"
        fill="var(--jade)"
      />
    </svg>
  );
}

/* 라벨 옆에 붙이는 범용 상세보기(ⓘ) 버튼 + 레이어팝업.
 * title 과 children(설명 문단)을 받아 포털로 body 에 띄운다. ESC·백드롭·X 로 닫기. */
export function InfoTip({ title, children, label = "자세히 보기", size = 18 }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={styles.dot}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <InfoBadge size={size} />
      </button>

      {open &&
        createPortal(
          <div className={styles.overlay} onClick={() => setOpen(false)}>
            <div
              className={styles.popup}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" className={styles.close} aria-label="닫기" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
              <h3 className={styles.title}>{title}</h3>
              <div className={styles.body}>{children}</div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
