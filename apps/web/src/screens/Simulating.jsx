import { useState, useEffect } from "react";
import styles from "./Simulating.module.css";

const MSGS = ["월별 적립금 굴리는 중", "배당금 재투자 복리 적용 중", "세금 효과 계산 중"];

export function Simulating() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % MSGS.length), 520);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={styles.wrap}>
      <div className={styles.center}>
        <div className={`${styles.spinner} spin`} />
        <div className={styles.title}>눈덩이를 굴리는 중…</div>
        <div className={styles.msg}>{MSGS[i]}</div>
      </div>
    </div>
  );
}
