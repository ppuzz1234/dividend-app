import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, RefreshCw, ShieldCheck, Lock, Check, X, BadgeCheck } from "lucide-react";
import { MYDATA_ACCOUNTS } from "@devidend/core";
import { Button } from "../components/ui/Button.jsx";
import { CubeLoader } from "../components/ui/CubeLoader.jsx";
import { logoFor } from "../lib/institutionLogos.js";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./MydataConnect.module.css";

/* 마이데이터로 불러오는 계좌 유형 라벨 (mock 스냅샷 키 매핑) */
const ACCT_LABELS = { general: "일반 위탁계좌", isa: "ISA", irp: "IRP", pension: "연금저축" };

/* 마이데이터 조회 동의 항목 — 실제 마이데이터 동의 화면 느낌의 조회 범위 */
const SCOPES = [
  "계좌 잔고 및 평가금액",
  "최근 1년 거래내역",
  "보유 상품(종목) 내역",
  "전년도 소득정보 (금융소득·총소득)",
];

/* intro 에서 미리 보여주는 조회 범위 축약 칩 */
const SCOPE_CHIPS = ["잔고·평가금액", "거래내역", "보유상품", "전년 소득"];

/* 불러온 계좌 리스트 — 스냅샷을 화면용으로 정규화 */
const LOADED = Object.entries(MYDATA_ACCOUNTS).map(([id, a]) => ({
  id,
  label: ACCT_LABELS[id] ?? id,
  institution: a.institution,
  logo: logoFor(a.institution),
  balance: a.balance,
}));
const LOADED_TOTAL = LOADED.reduce((s, a) => s + (a.balance || 0), 0);

/* CubeLoader 애니메이션 한 사이클(4.6s)을 1회 재생한 뒤 계좌 화면으로 넘어간다 */
const LOADER_CYCLE_MS = 4600;
const LOADER_REPEAT = 1;

/* (데모 전용) 마이데이터 연동 — 화면 레이아웃(본문 + 하단 고정 CTA)을 직접 소유한다.
 *  intro(동의 유도) → [동의 시트] → loading(브랜드 로더) → loaded(불러온 계좌 확인)
 *  → onNext 로 계좌 분석 화면 진입. 데이터는 파일(MYDATA_ACCOUNTS)에서 그대로. */
export function MydataConnect({ onNext }) {
  const [phase, setPhase] = useState("intro"); // intro | loading | loaded
  const [consentOpen, setConsentOpen] = useState(false);

  // 동의 완료 → 로딩 → 불러오기 완료
  useEffect(() => {
    if (phase !== "loading") return undefined;
    const t = setTimeout(() => setPhase("loaded"), LOADER_CYCLE_MS * LOADER_REPEAT);
    return () => clearTimeout(t);
  }, [phase]);

  const onAgree = () => {
    setConsentOpen(false);
    setPhase("loading");
  };

  // ── 로딩 ──
  if (phase === "loading") {
    return (
      <div className={styles.screen}>
        <div className={styles.bodyCenter}>
          <CubeLoader msgs={["금융사 계좌 조회 중", "잔고·거래내역 취합 중", "전년도 소득정보 확인 중"]} />
        </div>
      </div>
    );
  }

  // ── 불러오기 완료 ──
  if (phase === "loaded") {
    return (
      <div className={styles.screen}>
        <div className={styles.body}>
          <div className={cx(styles.totalCard, styles.reveal)}>
            <div className={styles.totalHead}>
              <BadgeCheck size={16} className={styles.totalCheck} />
              <span>계좌 {LOADED.length}개 연동 완료</span>
            </div>
            <b className={styles.totalV}>{fmtKRW(LOADED_TOTAL)}</b>
            <span className={styles.totalK}>총 평가금액</span>
          </div>

          <ul className={styles.acctList}>
            {LOADED.map((a, i) => (
              <li key={a.id} className={cx(styles.acct, styles.seq)} style={{ animationDelay: `${i * 90}ms` }}>
                <span className={styles.acctLogo}>
                  {a.logo ? (
                    <img src={a.logo} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
                  ) : (
                    a.institution.slice(0, 1)
                  )}
                </span>
                <span className={styles.acctInfo}>
                  <b className={styles.acctInst}>{a.institution}</b>
                  <span className={styles.acctType}>{a.label}</span>
                </span>
                <b className={styles.acctBal}>{fmtKRW(a.balance)}</b>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.footer}>
          <Button onClick={onNext} icon={ArrowRight}>
            이 계좌로 분석 시작하기
          </Button>
        </div>
      </div>
    );
  }

  // ── intro: 최적 솔루션을 위해 마이데이터 조회 동의를 구하는 화면 ──
  return (
    <div className={styles.screen}>
      <div className={cx(styles.body, styles.reveal)}>
        <header className={styles.head}>
          <h2 className={styles.title}>
            정확한 절세 설계를 위해,
            <br />
            계좌를 <em>안전하게</em> 불러올게요.
          </h2>
          <p className={styles.sub}>
            흩어진 계좌와 전년도 소득을 마이데이터로 한 번에 조회해, 나에게 맞는 절세·배분 솔루션을 계산해요.
          </p>
        </header>

        <section className={styles.panel} aria-label="안전한 마이데이터 연동 안내">
          <div className={styles.emblem} aria-hidden="true">
            <span className={styles.emblemRing} />
            <Lock size={26} strokeWidth={2} />
          </div>
          <div className={styles.panelTitle}>조회 전용으로만 연결돼요</div>
          <div className={styles.panelSub}>금융보안원 인증 · 이체나 출금 권한은 요청하지 않아요</div>

          <ul className={styles.assure}>
            <li>
              <ShieldCheck size={16} /> 조회한 정보는 오직 절세·배분 전략 계산에만 사용돼요
            </li>
            <li>
              <ShieldCheck size={16} /> 동의 후에도 언제든 연동을 해지할 수 있어요
            </li>
          </ul>

          <div className={styles.scopes}>
            <span className={styles.scopeCap}>불러오는 정보</span>
            <div className={styles.chips}>
              {SCOPE_CHIPS.map((c) => (
                <span key={c} className={styles.chip}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <Button onClick={() => setConsentOpen(true)} icon={RefreshCw}>
          마이데이터 연동하기
        </Button>
        <p className={styles.footNote}>연동은 30초면 끝나요. 다음 화면에서 조회 범위를 확인하고 동의할 수 있어요.</p>
      </div>

      {consentOpen && <ConsentSheet onAgree={onAgree} onClose={() => setConsentOpen(false)} />}
    </div>
  );
}

/* 마이데이터 조회 동의 바텀시트 — 조회 범위 안내 + 전체 동의 후 연동 진행 */
function ConsentSheet({ onAgree, onClose }) {
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="마이데이터 조회 동의"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.grabber} aria-hidden="true" />

        <div className={styles.sheetHead}>
          <div>
            <h2 className={styles.sheetTitle}>마이데이터 조회 동의</h2>
            <p className={styles.sheetSub}>PLUS CUBE 가 아래 정보를 조회하는 것에 동의해 주세요.</p>
          </div>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.sheetBody}>
          <ul className={styles.scopeList}>
            {SCOPES.map((s) => (
              <li key={s} className={styles.scope}>
                <span className={styles.scopeDot}>
                  <Check size={13} strokeWidth={3} />
                </span>
                {s}
              </li>
            ))}
          </ul>

          <button
            type="button"
            className={styles.agreeAll}
            onClick={() => setAgreed((v) => !v)}
            aria-pressed={agreed}
          >
            <span className={cx(styles.check, agreed && styles.checkOn)}>
              {agreed && <Check size={14} strokeWidth={3} />}
            </span>
            <span className={styles.agreeLabel}>위 조회 항목에 전체 동의합니다 (필수)</span>
          </button>
        </div>

        <div className={styles.sheetFooter}>
          <Button onClick={() => agreed && onAgree?.()} icon={ArrowRight} disabled={!agreed}>
            동의하고 연동하기
          </Button>
          {!agreed && <p className={styles.footNote}>연동을 진행하려면 전체 동의가 필요해요.</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}
