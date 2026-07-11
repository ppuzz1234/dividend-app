import { useState } from "react";
import BrandMark from "../components/ui/BrandMark.jsx";
import styles from "./Login.module.css";

/* 로그인 — hpr Login과 동일한 구조(브랜드 헤더 · SSO 목록 · "또는" 구분 ·
   휴대폰 로그인 · 하단 링크). CLEVR은 별도 인증 백엔드가 없는 데모 플로우라,
   어떤 로그인 수단을 눌러도 기존 온보딩(회원가입)으로 진입한다. */
export function Login({ onNext }) {
  const [phoneMode, setPhoneMode] = useState(false);
  const [phone, setPhone] = useState("");

  const onPhone = (e) => {
    e.preventDefault();
    if (!phone.trim()) return;
    onNext?.();
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <header className={styles.brand}>
          <div className={styles.mark}>
            <BrandMark size={26} />
          </div>
          <div className={styles.titles}>
            <strong>CLEVR</strong>
            <span>절세와 투자를 현명하게</span>
          </div>
        </header>

        <h2 className={styles.h}>로그인 또는 회원가입</h2>

        <div className={styles.ssoList}>
          <button className={styles.ssoBtn} onClick={onNext}>
            <span className={styles.ssoIc}>{GOOGLE}</span>
            Google로 계속하기
          </button>
          <button className={styles.ssoBtn} onClick={onNext}>
            <span className={`${styles.ssoIc} ${styles.naverIc}`}>N</span>
            네이버로 계속하기
          </button>
          <button className={styles.ssoBtn} onClick={onNext}>
            <span className={`${styles.ssoIc} ${styles.kakaoIc}`}>{KAKAO}</span>
            카카오로 계속하기
          </button>
        </div>

        <div className={styles.or}>
          <span>또는</span>
        </div>

        {!phoneMode ? (
          <button className={styles.lineBtn} onClick={() => setPhoneMode(true)}>
            휴대폰으로 로그인
          </button>
        ) : (
          <form onSubmit={onPhone} className={styles.form}>
            <label className={styles.label}>휴대폰 번호</label>
            <input
              className={styles.input}
              type="tel"
              inputMode="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button type="submit" className={styles.primaryBtn} disabled={!phone.trim()}>
              계속
            </button>
          </form>
        )}

        <button className={styles.footLink} onClick={onNext}>
          이미 CLEVR 회원이신가요? <b>로그인하세요</b>
        </button>
      </div>
    </div>
  );
}

const GOOGLE = (
  <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 43.5c5.5 0 10.3-1.9 13.7-5.1l-6.3-5.3C29.3 34.6 26.8 35.5 24 35.5c-5.3 0-9.6-3.1-11.3-7.9l-6.6 5.1C9.7 39 16.2 43.5 24 43.5z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.4 4.2-4.6 5.6l6.3 5.3c-.4.4 6.5-4.7 6.5-14.9 0-1.2-.1-2.3-.4-3.5z" />
  </svg>
);
const KAKAO = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M12 4C6.48 4 2 7.58 2 12c0 2.76 1.83 5.2 4.6 6.63-.2.75-.73 2.73-.84 3.15-.14.53.19.52.4.38.17-.11 2.7-1.83 3.8-2.58.65.09 1.32.14 2.04.14 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
  </svg>
);
