import { useEffect, useState } from "react";
import BrandMark from "../components/ui/BrandMark.jsx";
import styles from "./Splash.module.css";

/* 스플래시 — hpr과 동일한 구조(시세 그리드 배경 · 발광 · 브랜드마크 · 아이브로우
   · 타이틀 · 슬로건 · 하단 진행바)를 따르되, GENIUS 브랜딩과 노란 달러 심볼로 구성.
   약 2.6초 후 로그인으로 자동 전환하고, 화면을 탭하면 즉시 스킵한다. */
export function Splash({ onStart }) {
  const [exiting, setExiting] = useState(false);

  const go = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => onStart?.(), 400);
  };

  useEffect(() => {
    const t = setTimeout(go, 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`${styles.splash} ${exiting ? styles.out : ""}`} onClick={go}>
      {/* 배경 — 시세 그리드 */}
      <svg className={styles.bg} viewBox="0 0 402 874" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={"h" + i} x1="0" y1={90 + i * 90} x2="402" y2={90 + i * 90} stroke="#221d13" strokeWidth="1" />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line key={"v" + i} x1={i * 100} y1="0" x2={i * 100} y2="874" stroke="#17120a" strokeWidth="1" />
        ))}
      </svg>

      <div className={styles.glow} />

      <div className={styles.core}>
        <div className={styles.mark}>
          <BrandMark size={56} glow />
        </div>
        <div className={styles.eyebrow}>SMART DIVIDEND · TAX SAVING</div>
        <h1 className={styles.title}>PLUS GENIUS</h1>
        <p className={styles.slogan}>절세 최적화 기반 ETF 은퇴 자산 확보 노하우</p>
      </div>

      <div className={styles.foot}>
        <div className={styles.bar}>
          <i />
        </div>
        <span>배당·절세 전략을 한 번에 설계하는 스마트 투자 시뮬레이터</span>
      </div>
    </div>
  );
}
