import { Check, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button.jsx";
import { fmtKRW } from "../lib/format.js";
import { C } from "../theme/tokens.js";
import styles from "./Done.module.css";

export function Done({ sim, onRestart }) {
  return (
    <div className={styles.screen}>
      <div className={styles.center}>
        <div className={`${styles.badge} popIn`}>
          <Check size={48} color={C.onJade} strokeWidth={3} />
        </div>
        <h1 className={styles.title}>시뮬레이션 완료</h1>
        <p className={styles.desc}>
          꾸준히 적립하고 배당을 재투자하면,
          <br />매월 받는 배당이 이만큼 자라요.
        </p>
        <div className={styles.card}>
          <div className={styles.cardLabel}>마지막 해 월 환산 배당</div>
          <div className={styles.cardValue}>{fmtKRW(sim.monthlyIncome)}</div>
          <div className={styles.cardSub}>최종 평가금액 {fmtKRW(sim.finalValue)}</div>
        </div>
      </div>
      <Button onClick={onRestart} variant="ghost" icon={RefreshCw}>
        다시 시뮬레이션
      </Button>
    </div>
  );
}
