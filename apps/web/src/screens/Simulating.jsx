import { useState, useEffect } from "react";
import styles from "./Simulating.module.css";
import { cx } from "../lib/cx.js";

const LETTERS = ["C", "L", "E", "V", "R"];
const MSGS = ["계좌별 배분 계산 중", "배당 재투자 복리 적용 중", "세금·건강보험 효과 분석 중"];

const STEP = 300; // 글자 간 등장 간격(ms)
const HOLD = 700; // 완성 후 유지(ms)
const FADE = 600; // 사라짐 + 공백(ms)

export function Simulating() {
  const [visible, setVisible] = useState(0); // 나타난 글자 수
  const [fading, setFading] = useState(false); // 전체 사라지는 중
  const [msg, setMsg] = useState(0);

  // CLEVR 글자별 fade-in → 완성 → 사라짐 → 반복
  useEffect(() => {
    let cancelled = false;
    const timers = [];
    const cycle = () => {
      if (cancelled) return;
      setFading(false);
      setVisible(0);
      for (let i = 1; i <= LETTERS.length; i++) {
        timers.push(setTimeout(() => setVisible(i), i * STEP));
      }
      const holdAt = LETTERS.length * STEP + HOLD;
      timers.push(setTimeout(() => setFading(true), holdAt));
      timers.push(setTimeout(cycle, holdAt + FADE));
    };
    cycle();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  // 하단 진행 문구 순환
  useEffect(() => {
    const t = setInterval(() => setMsg((v) => (v + 1) % MSGS.length), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.center}>
        <div className={styles.word} aria-label="CLEVR">
          {LETTERS.map((ch, i) => (
            <span key={i} className={cx(styles.letter, i < visible && !fading && styles.on)}>
              {ch}
            </span>
          ))}
        </div>
        <div className={styles.msg}>{MSGS[msg]}</div>
      </div>
    </div>
  );
}
