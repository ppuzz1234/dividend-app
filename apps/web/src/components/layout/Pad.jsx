import styles from "./Pad.module.css";

/* 화면 공통 레이아웃: 본문 영역 + 하단 고정 푸터(버튼) */
export function Pad({ children, footer }) {
  return (
    <>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </>
  );
}
