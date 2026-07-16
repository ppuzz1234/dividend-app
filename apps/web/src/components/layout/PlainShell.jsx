import { cx } from "../../lib/cx.js";
import styles from "./PlainShell.module.css";

/* 실서비스 기본 셸 — 베젤 없이 화면을 채움.
 * 모바일: 풀폭/풀하이트, 데스크톱: 모바일 폭 컬럼 중앙정렬.
 * inset=true(/device iframe 임베드) 시 다이나믹 아일랜드를 피하는 상단 인셋 적용. */
export function PlainShell({ children, inset = false }) {
  return (
    <div className={styles.viewport}>
      <div className={cx(styles.col, inset && styles.inset)}>{children}</div>
    </div>
  );
}
