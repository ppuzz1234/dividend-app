import { useState, useEffect } from "react";
import BrandMark from "../components/ui/BrandMark.jsx";
import styles from "./Simulating.module.css";

/* 로딩 — 앱 로고(2D BrandMark)를 은은히 펄스시키는 대기 화면.
 * "최종 진행하기" 직후(자산 탭 진입 전)와 구글 인증 복귀 대기에 사용된다. */
const MSGS = ["매수 주문 접수 중", "계좌별 배분 실행 중", "포트폴리오 구성 중"];

export function Simulating() {
  const [msg, setMsg] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setMsg((v) => (v + 1) % MSGS.length), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.center}>
        <div className={styles.logo}>
          <BrandMark size={92} glow />
        </div>
        <div className={styles.msg}>{MSGS[msg]}</div>
      </div>
    </div>
  );
}
