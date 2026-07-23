import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, ChevronRight, X } from "lucide-react";
import { Button } from "../components/ui/Button.jsx";
import { PrepModal } from "../components/ui/PrepModal.jsx";
import BrandMark from "../components/ui/BrandMark.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./DividendSwitch.module.css";

/* 배당 전환 — 모아온 자산 전액을 배당 상품으로 전환하는 스크롤텔링 화면.
 * 구성: 히어로(총자산 + 코인 그래픽) → 왜 전환하죠? → 배당 ETF vs 커버드콜 ETF 비교
 * → 하단 고정 CTA → 자동 매매 권한 동의 시트 → (이후 상세는 준비 중 모달). */

const ETF_OPTIONS = [
  {
    id: "div",
    name: "배당 ETF",
    rate: 0.04,
    badge: "연 4% 배당",
    desc: "보유 기업이 지급하는 배당금과 주가 상승에 따른 시세 차익을 동시에 추구하는 상품이에요.",
    point: "배당 + 시세차익",
  },
  {
    id: "cc",
    name: "커버드콜 ETF",
    rate: 0.1,
    badge: "연 10% 분배",
    desc: "주식을 보유한 상태에서 콜옵션을 매도해 높은 옵션 프리미엄(수수료) 수익을 얻어요. 대신 주가가 크게 오를 때 상방 수익이 제한돼요.",
    point: "높은 분배금, 상방 제한",
  },
];

const CONSENTS = [
  "보유 상품 전량 매도 위임 (필수)",
  "배당 상품 자동 매수 위임 (필수)",
  "전환 수수료·세금 발생 안내 확인 (필수)",
];

export function DividendSwitch({ assets = 0, onClose }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [prep, setPrep] = useState(null); // null | "detail" | "done"
  const bodyRef = useRef(null);

  // 스크롤 리빌 — 섹션이 뷰포트에 들어오면 등장 (IntersectionObserver).
  // 렌더 프레임이 멈춘 환경(백그라운드 탭 등)에서 IO 가 발화하지 않아도
  // 콘텐츠가 숨어 있지 않도록 안전 타이머로 전체를 드러낸다.
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return undefined;
    const els = [...root.querySelectorAll(`.${styles.reveal}`)];
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add(styles.shown)),
      { threshold: 0.25 }
    );
    els.forEach((el) => io.observe(el));
    const safety = setTimeout(() => els.forEach((el) => el.classList.add(styles.shown)), 2500);
    return () => {
      io.disconnect();
      clearTimeout(safety);
    };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const monthly = (rate) => Math.round((assets * rate) / 12 / 10000) * 10000;

  return createPortal(
    <div className={styles.screen}>
      <header className={styles.top}>
        <button type="button" className={styles.back} aria-label="뒤로" onClick={onClose}>
          <ArrowLeft size={20} strokeWidth={2.2} />
        </button>
      </header>

      <div className={styles.scroll} ref={bodyRef}>
        {/* 히어로 — 브랜드 칩 + 헤드라인 + 코인 그래픽 + 모은 자산 */}
        <section className={styles.hero}>
          <span className={styles.brandChip}>
            <BrandMark size={16} /> PLUS CUBE
          </span>
          <h1 className={styles.h1}>
            모아온 자산 전액,
            <br />
            매달 배당으로 받기
          </h1>

          <div className={styles.coins} aria-hidden="true">
            <i /><i /><i /><i /><i />
          </div>

          <div className={styles.assetCard}>
            <span className={styles.assetCap}>지금까지 모은 자산</span>
            <strong className={styles.assetVal}>{fmtKRW(assets)}</strong>
            <span className={styles.assetSub}>전액을 배당 상품으로 전환할 수 있어요.</span>
          </div>
        </section>

        {/* 왜 전환하죠? */}
        <section className={cx(styles.section, styles.reveal)}>
          <span className={styles.q}>왜 전환하죠?</span>
          <h2 className={styles.h2}>
            모은 자산이
            <br />
            <em>매달 월급</em>이 돼요
          </h2>
          <p className={styles.lead}>
            성장에 쓰던 자산을 배당 상품으로 바꾸면, 매달 현금흐름이 계좌로 들어와요.
          </p>
        </section>

        {/* 두 ETF 비교 */}
        <section className={cx(styles.section, styles.reveal)}>
          <span className={styles.q}>어떤 상품으로 바꾸죠?</span>
          <h2 className={styles.h2}>두 가지 방법이 있어요</h2>

          <div className={styles.etfList}>
            {ETF_OPTIONS.map((o) => (
              <article key={o.id} className={styles.etfCard}>
                <div className={styles.etfHead}>
                  <h3 className={styles.etfName}>{o.name}</h3>
                  <span className={styles.etfBadge}>{o.badge}</span>
                </div>
                <p className={styles.etfDesc}>{o.desc}</p>
                <div className={styles.etfEst}>
                  <span className={styles.etfEstK}>전환 시 예상 월 배당</span>
                  <b className={styles.etfEstV}>약 {fmtKRW(monthly(o.rate))}</b>
                </div>
                <button type="button" className={styles.etfMore} onClick={() => setPrep("detail")}>
                  자세히 보기 <ChevronRight size={14} strokeWidth={2.4} />
                </button>
              </article>
            ))}
          </div>
          <p className={styles.note}>예상 배당은 현재 자산 기준 단순 추정이며, 시장 상황에 따라 달라져요.</p>
        </section>
      </div>

      {/* 하단 고정 CTA */}
      <div className={styles.foot}>
        <Button variant="gold" icon={ArrowRight} onClick={() => setSheetOpen(true)}>
          전환 시작하기
        </Button>
      </div>

      {sheetOpen && (
        <ConsentSheet
          onClose={() => setSheetOpen(false)}
          onAgree={() => {
            setSheetOpen(false);
            setPrep("done");
          }}
        />
      )}
      {prep && (
        <PrepModal
          title="준비 중이에요"
          desc={
            prep === "done"
              ? "동의가 완료됐어요. 전환 상세 화면은 준비 중이에요."
              : "상품 상세 화면은 준비 중이에요."
          }
          onClose={() => setPrep(null)}
        />
      )}
    </div>,
    document.body
  );
}

/* 자동 매매 권한 동의 시트 — 필수 3건 모두 체크해야 계속하기 활성화 */
function ConsentSheet({ onAgree, onClose }) {
  const [checked, setChecked] = useState(() => CONSENTS.map(() => false));
  const all = checked.every(Boolean);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (i) => setChecked((s) => s.map((v, j) => (j === i ? !v : v)));
  const toggleAll = () => setChecked((s) => s.map(() => !all));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="자동 매매 권한 동의" onClick={(e) => e.stopPropagation()}>
        <span className={styles.grabber} aria-hidden="true" />
        <div className={styles.sheetHead}>
          <div>
            <h2 className={styles.sheetTitle}>자산 전액을 배당 상품으로 전환할게요</h2>
            <p className={styles.sheetSub}>자동 매매 권한 동의만 하면 끝!</p>
          </div>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <button type="button" className={cx(styles.allRow, all && styles.allOn)} onClick={toggleAll} aria-pressed={all}>
          <span className={cx(styles.check, all && styles.checkOn)}>{all && <Check size={13} strokeWidth={3.4} />}</span>
          전환에 꼭 필요한 동의 (필수)
        </button>

        <div className={styles.consentList}>
          {CONSENTS.map((label, i) => (
            <button key={label} type="button" className={styles.consentRow} onClick={() => toggle(i)} aria-pressed={checked[i]}>
              <span className={cx(styles.checkSm, checked[i] && styles.checkOn)}>
                {checked[i] && <Check size={11} strokeWidth={3.6} />}
              </span>
              {label}
            </button>
          ))}
        </div>

        <div className={styles.sheetFoot}>
          <Button variant="gold" icon={ArrowRight} disabled={!all} onClick={() => all && onAgree?.()}>
            동의하고 전환 계속하기
          </Button>
        </div>
      </div>
    </div>
  );
}
