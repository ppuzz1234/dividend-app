import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import BrandMark from "../components/ui/BrandMark.jsx";
import { Button } from "../components/ui/Button.jsx";
import { cx } from "../lib/cx.js";
import styles from "./Intro.module.css";

/* 온보딩 인트로 — 스크롤 내러티브.
 * 넘기는 캐러셀을 버리고, 스크롤을 내리면 풀스크린 장면 4개가 스냅되며 등장한다.
 *   1) 훅   — 은퇴 후에도 현금흐름은 계속되어야 한다
 *   2) 목표 — 월 목표 현금흐름(카운트업) + 세후 실수령 인사이트
 *   3) 방법 — 3개 계좌를 절세 우선순위로 최적화
 *   4) 실행 — 발산 성장 곡선 + 단일 CTA "3분 만에 내 설계 시작하기"
 * 스크롤 컨테이너(#scrollArea)에 스냅을 걸고, 각 장면은 IntersectionObserver 로 reveal.
 * 모든 모션은 prefers-reduced-motion 을 존중한다. */

const SCENE_COUNT = 5;

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

/* rAF 카운트업 — enabled 가 켜질 때 0 → target. reduce/미진입이면 target 즉시. */
function useCountUp(target, { duration = 1400, enabled = true } = {}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let raf;
    let start = null;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (ts) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      setVal(Math.round(target * ease(p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);
  return enabled ? val : target;
}

/* 발산 성장 곡선 — 같은 출발점에서 '최적화' 경로가 '일반' 경로보다 높아진다.
 * 가짜 대시보드가 아니라, 절세 최적화의 결과 차이를 표현하는 개념 데이터 비주얼. */
function DivergingChart({ play }) {
  const optim = "M 8 148 C 78 140, 120 118, 178 82 S 276 30, 314 14";
  const normal = "M 8 148 C 80 145, 132 137, 194 121 S 282 100, 314 92";
  const fill = `${optim} L 314 92 C 282 100, 194 121, 8 148 Z`;
  return (
    <svg className={styles.chart} viewBox="0 0 322 164" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="pcGap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--jade)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--jade)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="8" y1="156" x2="314" y2="156" stroke="var(--line2)" strokeWidth="1" />
      <path className={cx(styles.gap, play && styles.gapIn)} d={fill} fill="url(#pcGap)" />
      <path
        className={cx(styles.lineNormal, play && styles.drawSlow)}
        d={normal}
        stroke="var(--line2)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="4 6"
      />
      <path
        className={cx(styles.lineOptim, play && styles.draw)}
        d={optim}
        stroke="var(--jade)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle className={cx(styles.endDot, play && styles.endIn)} cx="314" cy="14" r="6" fill="var(--jade)" />
    </svg>
  );
}

const ACCOUNTS = [
  { name: "ISA", note: "비과세·분리과세로 먼저 채우기" },
  { name: "연금저축", note: "세액공제 한도까지 납입" },
  { name: "IRP", note: "추가 공제·과세이연 활용" },
];

export function Intro({ onNext }) {
  const reduce = usePrefersReducedMotion();
  const [sceneH, setSceneH] = useState(null);
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState(() => new Set([0]));
  const wrapRef = useRef(null);

  const amount = useCountUp(1000, { enabled: !reduce && revealed.has(1) });

  /* 스크롤 뷰포트 높이를 측정해 각 장면을 정확히 한 화면 높이로 맞춘다(셸 무관). */
  useLayoutEffect(() => {
    const sc = document.getElementById("scrollArea");
    if (!sc) return undefined;
    const measure = () => setSceneH(sc.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);

  /* 스크롤 컨테이너에 세로 스냅을 걸어 '화면 전환' 느낌을 만든다(언마운트 시 원복). */
  useEffect(() => {
    const sc = document.getElementById("scrollArea");
    if (!sc || reduce) return undefined;
    sc.classList.add(styles.snapRoot);
    return () => {
      sc.classList.remove(styles.snapRoot);
      sc.scrollTop = 0;
    };
  }, [reduce]);

  /* 장면 진입 감지 — 진행 레일(active) + reveal(한 번) 처리.
   * reduce 면 관찰하지 않고 isIn 이 항상 true 를 반환한다(전부 정적 노출). */
  useEffect(() => {
    if (reduce) return undefined;
    const sc = document.getElementById("scrollArea");
    const els = wrapRef.current ? Array.from(wrapRef.current.querySelectorAll("[data-scene]")) : [];
    if (!els.length) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const idx = Number(e.target.dataset.scene);
          setActive(idx);
          setRevealed((prev) => (prev.has(idx) ? prev : new Set(prev).add(idx)));
        });
      },
      { root: sc, threshold: 0.55 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [reduce, sceneH]);

  const sceneStyle = { minHeight: sceneH ? `${sceneH}px` : "100dvh" };
  const isIn = (i) => reduce || revealed.has(i);

  return (
    <div className={styles.wrap} ref={wrapRef} style={{ "--sceneH": sceneH ? `${sceneH}px` : "100dvh" }}>
      {/* 스크롤 내내 고정되는 HUD — 브랜드 / 진행 레일 / 조용한 건너뛰기 */}
      <div className={styles.hud}>
        <div className={styles.brand}>
          <BrandMark size={22} />
          <span className={styles.brandName}>PLUS CUBE</span>
        </div>
        <button type="button" className={styles.skip} onClick={onNext}>
          바로 시작
        </button>
        <div className={styles.rail} aria-hidden="true">
          {Array.from({ length: SCENE_COUNT }).map((_, i) => (
            <span key={i} className={cx(styles.tick, i === active && styles.tickOn, i < active && styles.tickPast)} />
          ))}
        </div>
      </div>

      {/* 1) 훅 */}
      <section
        data-scene="0"
        className={cx(styles.scene, styles.sceneHook, isIn(0) && styles.in)}
        style={sceneStyle}
      >
        <div className={styles.orb} aria-hidden="true" />
        <h2 className={styles.hookTitle}>
          <span className={styles.rise} style={{ "--i": 0 }}>내년 연말정산</span>
          <span className={styles.rise} style={{ "--i": 1 }}>
            환급 최대화<sup className={styles.hookStar}>*</sup>,
          </span>
          <br />
          <span className={styles.rise} style={{ "--i": 2 }}>목표 현금 흐름을 위한</span>
          <span className={styles.rise} style={{ "--i": 3 }}>
            나의 <em>금융빌딩</em> 만들기,
          </span> <br />
          <span className={styles.rise} style={{ "--i": 4 }}>5분으로 알려드립니다.</span>
        </h2>
        <p className={cx(styles.hookNote, styles.rise)} style={{ "--i": 5 }}>
          *절세 계좌(연금저축/IRP/ISA) 관련 기준입니다.
        </p>
      </section>

      {/* 2) 목표 현금흐름 + 인사이트 */}
      <section
        data-scene="1"
        className={cx(styles.scene, styles.sceneGoal, isIn(1) && styles.in)}
        style={sceneStyle}
      >
        <p className={cx(styles.label, styles.labelGoal, styles.rise)} style={{ "--i": 0 }}>고객님의 목표 · 월 현금흐름</p>
        <div className={cx(styles.figure, styles.rise)} style={{ "--i": 1 }}>
          <span className={styles.won}>월</span>
          <span className={styles.amount}>{amount.toLocaleString("ko-KR")}</span>
          <span className={styles.unit}>만원</span>
        </div>
        <p className={cx(styles.goalSub, styles.rise)} style={{ "--i": 2 }}>
          같은 자산이라도 세금과 건보료를 줄이면,
          <br />
          <b>세후 실수령액</b>이 달라집니다.
        </p>
      </section>

      {/* 3) 절세 비교 — 같은 1.2억도 받는 방법에 따라 세금이 달라진다 */}
      <section
        data-scene="2"
        className={cx(styles.scene, styles.sceneTax, isIn(2) && styles.in)}
        style={sceneStyle}
      >
        <p className={cx(styles.label, styles.rise)} style={{ "--i": 0 }}>연 1.2억을 배당으로 받는다면</p>
        <h2 className={cx(styles.taxTitle, styles.rise)} style={{ "--i": 1 }}>
          세금에 건강보험료까지,
          <br />
          부담이 이만큼 달라집니다.
        </h2>

        <div className={styles.taxRows}>
          <div className={cx(styles.taxRow, styles.rise)} style={{ "--i": 2 }}>
            <span className={styles.taxRowK}>일반계좌 · 종합과세</span>
            <b className={styles.taxRowV}>약 3,400만원</b>
          </div>
          <div className={cx(styles.taxRow, styles.taxRowGood, styles.rise)} style={{ "--i": 3 }}>
            <span className={styles.taxRowK}>연금저축계좌 · 분리과세</span>
            <b className={styles.taxRowV}>약 1,000만원</b>
          </div>
        </div>

        <p className={cx(styles.taxSave, styles.rise)} style={{ "--i": 4 }}>
          매년 <b className={styles.taxSaveVal}>2,400만원</b> 덜 냅니다.
        </p>
      </section>

      {/* 4) 3개 계좌 절세 우선순위 */}
      <section
        data-scene="3"
        className={cx(styles.scene, styles.sceneHow, isIn(3) && styles.in)}
        style={sceneStyle}
      >
        <h2 className={cx(styles.howTitle, styles.rise)} style={{ "--i": 0 }}>
          각자의 소득, 연령에 맞는<br />절세 계좌 최적화를 수행합니다.
        </h2>
        <ol className={styles.accounts}>
          {ACCOUNTS.map((a, i) => (
            <li key={a.name} className={cx(styles.accRow, styles.rise)} style={{ "--i": i + 1 }}>
              <span className={styles.accNum}>{i + 1}</span>
              <span className={styles.accBody}>
                <span className={styles.accName}>{a.name}</span>
                <span className={styles.accNote}>{a.note}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* 5) 실행 — 발산 곡선 + CTA */}
      <section
        data-scene="4"
        className={cx(styles.scene, styles.sceneCta, isIn(4) && styles.in)}
        style={sceneStyle}
      >
        <div className={cx(styles.chartWrap, styles.rise)} style={{ "--i": 0 }}>
          <DivergingChart play={reduce || isIn(4)} />
          <span className={styles.chartLabelHi}>최적화</span>
          <span className={styles.chartLabelLo}>일반</span>
        </div>
        <h2 className={cx(styles.ctaTitle, styles.rise)} style={{ "--i": 1 }}>
          지금 바로,<br />절세를 위한 투자 계좌<br /> 최적화 설계를 시작합니다.
        </h2>
        <div className={cx(styles.ctaAction, styles.rise)} style={{ "--i": 2 }}>
          <Button onClick={onNext} icon={ArrowRight}>
            나의 절세 설계 시작하기
          </Button>
          <p className={styles.reassure}>예상 소요 3분 · 목표는 언제든 다시 바꿀 수 있어요</p>
        </div>
      </section>
    </div>
  );
}
