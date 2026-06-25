import styles from "./PlainShell.module.css";

/* 실서비스 기본 셸 — 베젤 없이 화면을 채움.
 * 모바일: 풀폭/풀하이트, 데스크톱: 모바일 폭 컬럼 중앙정렬. */
export function PlainShell({ children }) {
  return (
    <div className={styles.viewport}>
      <div className={styles.col}>{children}</div>
    </div>
  );
}
