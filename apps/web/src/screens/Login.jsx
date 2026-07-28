import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BrandMark from "../components/ui/BrandMark.jsx";
import { loginWithGoogle, hasGoogleLayer, mountGoogleButton } from "../auth/google.js";
import styles from "./Login.module.css";

/* 로그인 — hpr Login과 동일한 구조(브랜드 헤더 · SSO 목록 · "또는" 구분 ·
   휴대폰 로그인 · 하단 링크).
   Google 은 Supabase Auth 실연동 전용 — 데모 폴백 없이 항상 구글 인증을 거친다.
   (네이버·카카오는 아직 데모 — Supabase 프로바이더 추가 시 동일 패턴으로 연결) */
export function Login({ onNext }) {
  const [phoneMode, setPhoneMode] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(null); // 진행 중인 provider
  const [err, setErr] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState(""); // 자동 이동이 막혔을 때의 수동 링크
  const [googleModal, setGoogleModal] = useState(false); // 구글 인증 레이어 모달

  const onPhone = (e) => {
    e.preventDefault();
    if (!phone.trim()) return;
    onNext?.();
  };

  const onGoogle = async () => {
    setErr("");
    setFallbackUrl("");
    // 레이어 모달 사용 가능(VITE_GOOGLE_CLIENT_ID 설정) — 새 창(팝업) 대신
    // 이 화면 위 모달 레이어에서 구글 계정 선택을 진행한다
    if (hasGoogleLayer) {
      setGoogleModal(true);
      return;
    }
    setBusy("google");
    try {
      // 폴백: 팝업창에서 구글 인증 → 완료되면 프로필이 resolve 된다 (창 전환 없음)
      const profile = await loginWithGoogle();
      onNext?.(profile);
    } catch (e) {
      setErr(e.message || "구글 로그인에 실패했습니다.");
      if (e.url) setFallbackUrl(e.url); // 팝업이 차단된 경우 수동 링크 제공
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <header className={styles.brand}>
          <div className={styles.mark}>
            <BrandMark size={44} />
          </div>
          <div className={styles.titles}>
            <strong>PLUS CUBE</strong>
            <span>절세와 투자를 현명하게</span>
          </div>
        </header>

        <h2 className={styles.h}>로그인 또는 회원가입</h2>

        <div className={styles.ssoList}>
          <button className={styles.ssoBtn} onClick={onGoogle} disabled={!!busy}>
            <span className={styles.ssoIc}>{GOOGLE}</span>
            {busy === "google" ? "구글 인증 중…" : "Google로 계속하기"}
          </button>
          <button className={styles.ssoBtn} onClick={() => onNext?.()} disabled={!!busy}>
            <span className={`${styles.ssoIc} ${styles.naverIc}`}>N</span>
            네이버로 계속하기
            <span className={styles.demoTag}>데모</span>
          </button>
          <button className={styles.ssoBtn} onClick={() => onNext?.()} disabled={!!busy}>
            <span className={`${styles.ssoIc} ${styles.kakaoIc}`}>{KAKAO}</span>
            카카오로 계속하기
            <span className={styles.demoTag}>데모</span>
          </button>
        </div>

        {err && <p className={styles.err}>{err}</p>}
        {fallbackUrl && (
          <a className={styles.fallbackLink} href={fallbackUrl} target="_top">
            구글 로그인 페이지로 이동하기
          </a>
        )}

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

        <button className={styles.footLink} onClick={() => onNext?.()}>
          이미 PLUS CUBE 회원이신가요? <b>로그인하세요</b>
        </button>
      </div>

      {googleModal && (
        <GoogleLayerModal
          onClose={() => setGoogleModal(false)}
          onDone={(profile) => {
            setGoogleModal(false);
            onNext?.(profile);
          }}
          onError={(e) => {
            setGoogleModal(false);
            setErr(e.message || "구글 로그인에 실패했습니다.");
          }}
        />
      )}
    </div>
  );
}

/* 구글 인증 레이어 모달 — 새 창(팝업) 대신 로그인 화면 위 레이어로 노출.
 * 구글 인증 페이지는 iframe 삽입이 차단되므로, 페이지 안에서 끝내려면
 * 공식 GIS 버튼(+FedCM 브라우저 모달) 조합이 유일하다. 버튼은 GIS 가
 * hostRef 요소 안에 직접 그린다. */
function GoogleLayerModal({ onClose, onDone, onError }) {
  const hostRef = useRef(null);
  useEffect(() => {
    let alive = true; // 모달이 닫힌 뒤 도착한 결과는 무시
    mountGoogleButton(hostRef.current)
      .then((p) => alive && onDone(p))
      .catch((e) => alive && onError(e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className={styles.gOverlay} onClick={onClose}>
      <div
        className={styles.gModal}
        role="dialog"
        aria-modal="true"
        aria-label="구글 계정으로 로그인"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.gIcon}>{GOOGLE}</span>
        <h2 className={styles.gTitle}>Google 계정으로 로그인</h2>
        <p className={styles.gDesc}>
          잠시 후 화면에 계정 선택이 떠요. 나타나지 않으면 아래 버튼으로 계속해 주세요.
        </p>
        <div ref={hostRef} className={styles.gBtnHost} />
        <button type="button" className={styles.gCancel} onClick={onClose}>
          다른 방법으로 로그인
        </button>
      </div>
    </div>,
    document.body
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
