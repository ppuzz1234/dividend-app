import { useEffect, useState } from "react";
import { cx } from "../../lib/cx.js";
import styles from "./GeniusLoader.module.css";

const LETTERS = ["G", "E", "N", "I", "U", "S"];
const STEP = 240; // 글자 간 등장 간격(ms)
const HOLD = 600; // 완성 후 유지(ms)
const FADE = 500; // 사라짐 + 공백(ms)

/* 인라인 GENIUS 로더 — 화면 전체를 덮는 Simulating 과 달리
 * 콘텐츠 영역 안에 삽입하는 컴팩트판. msgs 로 진행 문구 순환. */
export function GeniusLoader({ msgs = [] }) {
  const [visible, setVisible] = useState(0);
  const [fading, setFading] = useState(false);
  const [msg, setMsg] = useState(0);

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

  useEffect(() => {
    if (msgs.length < 2) return;
    const t = setInterval(() => setMsg((v) => (v + 1) % msgs.length), 900);
    return () => clearInterval(t);
  }, [msgs.length]);

  return (
    <div className={styles.wrap}>
      <div className={styles.word} aria-label="GENIUS">
        {LETTERS.map((ch, i) => (
          <span key={i} className={cx(styles.letter, i < visible && !fading && styles.on)}>
            {ch}
          </span>
        ))}
      </div>
      {msgs.length > 0 && <div className={styles.msg}>{msgs[msg % msgs.length]}</div>}
    </div>
  );
}
