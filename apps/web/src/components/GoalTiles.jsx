import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./GoalTiles.module.css";

/* 온보딩에서 정한 목표 2요소(생활비·필요 자산) 요약 타일.
 * 온보딩 마지막 단락 → 계좌(마이데이터 연동) 화면 상단으로 그대로 이어진다.
 * myAsset 전달 시 3열 — 기존 두 타일이 좌측으로 줄어들며 우측에 "내 자산" 타일이 열린다.
 * pulse: 화면 구성 완료 후 필요 자산 → 내 자산 순으로 숫자가 한 번 반짝이며
 *        아래 계산식(필요 − 보유)에 반영된다는 느낌을 준다 (계산 카드 쪽과 시차 동기). */
export function GoalTiles({ monthlyGoal, requiredNestEgg, myAsset, pulse }) {
  const hasAsset = myAsset != null;
  return (
    <div className={cx(styles.grid, hasAsset && styles.grid3)}>
      <div className={styles.tile}>
        <span className={styles.k}>목표 생활비</span>
        <b className={styles.v}>월 {monthlyGoal.toLocaleString()}만원</b>
      </div>
      <div className={styles.tile}>
        <span className={styles.k}>필요 자산</span>
        <b className={cx(styles.v, pulse && styles.flashNeed)}>{fmtKRW(requiredNestEgg)}</b>
      </div>
      {hasAsset && (
        <div className={cx(styles.tile, styles.assetTile)}>
          <span className={styles.k}>내 자산</span>
          <b className={cx(styles.v, pulse && styles.flashMine)}>{fmtKRW(myAsset)}</b>
        </div>
      )}
    </div>
  );
}
