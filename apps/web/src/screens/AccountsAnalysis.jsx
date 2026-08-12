import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ArrowDown, ChevronDown, SlidersHorizontal, TrendingUp, Wallet, Lock, Check, X } from "lucide-react";
import { CubeLoader } from "../components/ui/CubeLoader.jsx";
import { buildAccountRooms, deductionRate } from "@devidend/core";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./AccountsAnalysis.module.css";

/* 납입 우선순위는 엔진(buildAccountRooms)의 priority 를 그대로 따른다 —
 * 전략별 순서: cube(refund) 연금저축→IRP→ISA / growth 연금저축→ISA→IRP
 * / liquid(growth+유동성) ISA→연금저축→IRP */
const SHORT = { pensionSavings: "연금", isa: "ISA", irp: "IRP" };
const LEVEL_TAG = { good: "양호", warn: "개선 여지", act: "조치 필요" };

/* 전략 3택 1 — 결과(순서·배분)가 실제로 다른 세 가지만 노출한다.
 * 과거 2×2 조합(절세선호 × ISA출구) 중 배분이 동일한 중복을 정리한 단일 리스트로,
 * 각 전략은 (절세선호, ISA 출구, 유동성) 묶음에 매핑되고 이후 전 단계에 반영된다.
 *  · cube(기본): refund-isa1 — 연금저축→IRP→ISA, 올해 연말정산 환급 최대
 *  · growth: growth-isa1 — 연금저축→ISA→IRP, 장기 복리 극대화
 *  · liquid: growth-isa2-liq — ISA→연금저축→IRP, 55세 전 쓸 자금의 유동성 확보 */
const STRATEGIES = [
  {
    id: "cube",
    cube: true,
    name: "올해 세액공제 우선",
    desc: "연금저축·IRP 공제 한도(연 900만원)부터 채워 올해 연말정산 환급을 최대로 확보해요. ISA 만기 목돈은 연금저축으로 이전해 추가 공제까지 받아요.",
    pick: { taxPref: "refund", isaRollover: "isa1", liquidity: null },
  },
  {
    id: "growth",
    Icon: TrendingUp,
    name: "장기 자산 증식 우선",
    desc: "IRP의 안전자산 30% 제한을 피해 ISA를 먼저 채워, 은퇴까지 장기 복리 수익을 극대화해요.",
    pick: { taxPref: "growth", isaRollover: "isa1", liquidity: null },
  },
  {
    id: "liquid",
    Icon: Wallet,
    name: "자금 유동성 확보",
    desc: "55세 전에 쓸 계획이 있다면, 언제든 인출할 수 있는 ISA부터 채우고 만기 목돈은 재가입으로 굴려요.",
    pick: { taxPref: "growth", isaRollover: "isa2", liquidity: "short" },
  },
];

/* 계좌별 신호등 상태 도출 — 남은 여력이 아니라 '이 계좌로 달성 가능한 총 납입금(연 한도)과
 *  그에 따른 총 환급 예상액(한도 × 세액공제율)'을 기준으로 표기한다.
 *  · 조치 필요: 미개설(held===false)
 *  · 양호: 한도를 모두 채웠거나(room<=0), 개설된 상태에서 한도의 50% 이상 기납(pct>=50)
 *  · 개선 여지: 개설됐으나 기납이 한도의 50% 미만 */
function analyze(r) {
  const filled = r.room <= 0; // 한도 소진
  const half = r.held !== false && (r.pct ?? 0) >= 50; // 개설 & 한도 50%+ 기납
  const level = r.held === false ? "act" : filled || half ? "good" : "warn";

  if (r.roomType === "deduct") {
    const note =
      r.held === false
        ? `지금 개설하면 연 ${fmtKRW(r.limit)} 납입으로 매년 ${fmtKRW(r.maxRefund)}을 환급받을 수 있어요.`
        : filled
          ? `연 ${fmtKRW(r.limit)}을 모두 채워 매년 ${fmtKRW(r.maxRefund)}을 돌려받고 있어요.`
          : half
            ? `한도의 절반 이상을 채웠어요. 남은 ${fmtKRW(r.room)}까지 더 넣으면 매년 ${fmtKRW(r.maxRefund)}을 모두 세액공제로 돌려받아요.`
            : `이 계좌로 연 ${fmtKRW(r.limit)}까지 납입하면 매년 ${fmtKRW(r.maxRefund)}을 세액공제로 돌려받아요.`;
    return { level, note };
  }
  // ISA(limit) — 세액공제가 아닌 비과세이므로 총 납입 가능액과 비과세 혜택으로 표기
  const note =
    r.held === false
      ? `지금 개설하면 연 ${fmtKRW(r.limit)}까지 비과세로 굴릴 수 있어요.`
      : filled
        ? `연 ${fmtKRW(r.limit)} 비과세 한도를 모두 활용하고 있어요.`
        : half
          ? `비과세 한도의 절반 이상을 채웠어요. 남은 ${fmtKRW(r.room)}까지 더 담으면 순이익 ${fmtKRW(r.taxFreeLimit ?? 2_000_000)}을 비과세로 받아요.`
          : `이 계좌로 연 ${fmtKRW(r.limit)}까지 담아 순이익 ${fmtKRW(r.taxFreeLimit ?? 2_000_000)}을 비과세로 받을 수 있어요.`;
  return { level, note };
}

/* 혜택 증식 vs 패널티 — 세액공제 환급과 그 운용수익(복리)이 시간이 갈수록
 * 중도인출 패널티(기타소득세 16.5%, 납입 누계 비례) 위로 벌어지는 개념 곡선.
 * 정확한 수치 시뮬이 아니라 "이미 받은 혜택의 증식이 패널티를 상쇄한다"는 구조 설명용 */
function PenaltyOffsetChart() {
  return (
    <div className={styles.worryChartWrap}>
      <svg className={styles.worryChart} viewBox="0 0 320 132" fill="none" aria-hidden="true">
        <line x1="6" y1="120" x2="314" y2="120" stroke="var(--line2)" strokeWidth="1" />
        {/* 패널티 — 납입 누계에 비례해 완만히 오르는 점선 */}
        <path
          d="M 6 120 C 92 113, 204 102, 314 90"
          stroke="var(--line2)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="4 6"
        />
        {/* 혜택 증식 — 환급 즉시 효과에 복리가 붙어 가속 */}
        <path d="M 6 120 C 82 100, 182 70, 314 18" stroke="var(--jade)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="314" cy="18" r="5" fill="var(--jade)" />
      </svg>
      <span className={styles.worryLabelHi}>받은 혜택의 증식</span>
      <span className={styles.worryLabelLo}>중도인출 패널티</span>
    </div>
  );
}

/* ③ 3종 계좌 최적화 분석 — 상수(나이·소득) 기반 1차 산정을 상단에 보여주고,
 *  하단에서 개인 선호(절세선호도)를 고르면 납입 우선순위가 즉시 재정렬된다.
 *  여기서 고른 선호는 이후 단계(솔루션·배분·실행)의 금액 배분에도 그대로 반영된다. */
export function AccountsAnalysis({ mydata, manualAccounts, income, finIncome = 0, age, taxPref = "growth", onTaxPref, isaRollover = "isa1", onIsaRollover, liquidity = null, onLiquidity, onPerAccount, onNext }) {
  const { rooms, priority } = useMemo(
    () => buildAccountRooms({ mydata, manual: manualAccounts, income, finIncome, age, monthlyContribution: 0, taxPref, isaRollover, liquidity }),
    [mydata, manualAccounts, income, finIncome, age, taxPref, isaRollover, liquidity]
  );

  const items = useMemo(
    () =>
      priority.map((id, i) => {
        const r = rooms.find((x) => x.id === id) || { id };
        const pct = Math.max(0, Math.min(100, r.pct ?? 0));
        return { id, rank: i + 1, name: r.name ?? SHORT[id], why: r.priorityReason, pct, held: r.held ?? null, ...analyze(r) };
      }),
    [rooms, priority]
  );

  /* 현재 선택된 전략 — (taxPref, liquidity) 조합에서 역산한다. 과거 저장 데이터의
   * 어떤 조합이 와도 세 전략 중 하나로 수렴한다(refund 계열→cube, growth 계열→growth). */
  const strategyId = liquidity === "short" ? "liquid" : taxPref === "refund" ? "cube" : "growth";
  const pickStrategy = (s) => {
    onTaxPref?.(s.pick.taxPref);
    onIsaRollover?.(s.pick.isaRollover);
    onLiquidity?.(s.pick.liquidity);
    if (s.id === "cube") onPerAccount?.(null); // 추천 복귀 시 과거 수동 한도도 초기화
  };

  /* 선택 전략 효과 요약 — 납입 순서 + 소득 기준 공제율을 반영한 구체 수치 */
  const prefSummary = useMemo(() => {
    const rate = deductionRate(income);
    const maxRefund = Math.round(9_000_000 * rate); // 연금저축600+IRP300 공제 한도 총환급
    if (strategyId === "liquid")
      return "ISA → 연금저축 → IRP 순서예요. 중도 인출이 자유로운 계좌부터 채우고, 세액공제는 그다음에 챙겨요.";
    return strategyId === "cube"
      ? `연금저축 → IRP → ISA 순서로, 올해 연말정산에서 최대 ${fmtKRW(maxRefund)}을 돌려받아요.`
      : `연금저축 → ISA → IRP 순서예요. 장기 복리를 극대화하고, 세액공제(최대 ${fmtKRW(maxRefund)})는 그다음에 챙겨요.`;
  }, [strategyId, income]);

  // 설계 방식 엣지 패널 — 우측 "계좌 전략" 탭으로 열고 닫는다 (본문 스크롤과 무관)
  const [panelOpen, setPanelOpen] = useState(false);
  // 중도인출 반론 해소 카드 — 연금저축·IRP 추천을 본 직후의 "돈이 묶인다" 걱정을 그 자리에서 다룬다
  const [worryOpen, setWorryOpen] = useState(false);

  /* 우선순위 재정렬 FLIP — 행을 remount 하지 않고(key 고정) DOM 순서만 바뀌므로,
   * 이전 위치에서 새 위치로 translateY 슬라이드시켜 상하 교체를 자연스럽게 보여준다.
   * remount 가 없어 등장 애니메이션 재생(깜빡임)도, 스크롤 앵커 이탈(최상단 점프)도 없다. */
  const flowRef = useRef(null);
  const rowTopsRef = useRef(new Map());
  useLayoutEffect(() => {
    const flow = flowRef.current;
    if (!flow) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const flowTop = flow.getBoundingClientRect().top;
    const prev = rowTopsRef.current;
    const next = new Map();
    for (const el of flow.children) {
      const id = el.dataset.acct;
      if (!id) continue;
      const top = el.getBoundingClientRect().top - flowTop; // 컨테이너 기준(스크롤 무관)
      next.set(id, top);
      const old = prev.get(id);
      if (!reduce && old != null && Math.abs(old - top) > 1) {
        el.animate(
          [{ transform: `translateY(${old - top}px)` }, { transform: "translateY(0)" }],
          { duration: 340, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" }
        );
      }
    }
    rowTopsRef.current = next;
  });

  return (
    <Pad
      footer={
        <Button onClick={onNext} icon={ArrowRight}>
          은퇴 자산 목표 세우기
        </Button>
      }
    >
      <Heading sub="나이·소득 기준으로, 어떤 계좌부터 채워야 하는지와 지금 상태를 신호등으로 정리했어요.">
        절세 계좌 최적화 분석
      </Heading>

      {/* 신호등 범례 */}
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <i className={cx(styles.dot, styles.good)} /> 양호
        </span>
        <span className={styles.legendItem}>
          <i className={cx(styles.dot, styles.warn)} /> 개선 여지
        </span>
        <span className={styles.legendItem}>
          <i className={cx(styles.dot, styles.act)} /> 조치 필요
        </span>
      </div>

      {/* 우선순위 흐름 — 노드(신호등) + 오른쪽 설명.
       *  key 는 계좌 id 로 고정(remount 금지) — 재정렬은 위 FLIP 이 슬라이드로 표현한다 */}
      <div className={styles.flow} ref={flowRef}>
        {items.map((it, i) => {
          return (
            <div key={it.id} data-acct={it.id} className={styles.row} style={{ animationDelay: `${i * 130}ms` }}>
              <div className={styles.nodeCol}>
                {/* 진행 링 — 계좌 한도 소진율(pct)을 노드 테두리에 원형 게이지로 */}
                <span className={cx(styles.ring, styles[`ring_${it.level}`])} style={{ "--deg": `${it.pct * 3.6}deg` }}>
                  <span className={cx(styles.node, styles[it.level])}>
                    <span className={styles.nodeLabel}>{SHORT[it.id]}</span>
                  </span>
                </span>
                {i < items.length - 1 && (
                  <span className={styles.connector} aria-hidden="true">
                    <ArrowDown className={styles.connArrow} size={18} strokeWidth={2.8} />
                  </span>
                )}
              </div>

              <div className={styles.content}>
                <div className={styles.contentHead}>
                  <span className={styles.rank}>{it.rank}순위</span>
                  <span className={styles.name}>{it.name}</span>
                  <span className={cx(styles.tag, styles[`tag_${it.level}`])}>{LEVEL_TAG[it.level]}</span>
                </div>
                <p className={styles.why}>{it.why}</p>
                <p className={styles.note}>{it.note}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 반론 해소(멘트①②) — 55세 인출 제한 걱정을 추천 직후에 정면으로 다룬다 */}
      <div className={styles.worry}>
        <button
          type="button"
          className={styles.worryHead}
          onClick={() => setWorryOpen((o) => !o)}
          aria-expanded={worryOpen}
        >
          <span>55세까지 묶이는 돈이라 망설여지시나요?</span>
          <ChevronDown size={16} strokeWidth={2.6} className={cx(styles.worryChev, worryOpen && styles.worryChevOn)} />
        </button>
        {worryOpen && (
          <div className={styles.worryBody}>
            <p className={styles.worryLine}>
              미래의 일은 알 수 없어요. 불확실한 중도 인출 걱정보다,{" "}
              <b>지금 확실한 세액공제 혜택을 최대한 받는 것</b>이 먼저예요.
            </p>
            <PenaltyOffsetChart />
            <p className={styles.worryLine}>
              중도에 인출하게 되더라도, 이미 받은 세금 혜택이 만들어 낸{" "}
              <b>자산 증식이 패널티(기타소득세 16.5%)를 상쇄</b>해요.
            </p>
          </div>
        )}
      </div>

      {/* 큐브의 약속(멘트⑥) — 세 계좌 최적화의 마무리 선언, 다음 CTA(목표)로 잇는다 */}
      <div className={styles.promise}>
        <span className={styles.promiseIcon} aria-hidden="true">
          <CubeLoader size={18} bare />
        </span>
        <p className={styles.promiseText}>
          플러스 큐브가 세 가지 계좌의 <b>최적화 솔루션</b>을 설계하고, 실행을 <b>최대한 자동화</b>해요.
        </p>
      </div>

      {/* ── 설계 방식 — 우측 엣지 패널로 제공 (본문 스크롤 아래로 밀지 않는다) ──
       *  · 닫힘: 우측 모서리의 "계좌 전략" 세로 탭
       *  · 열림: 노드 열(신호등 흐름)은 가리지 않는 폭까지만 좌측으로 슬라이드,
       *    패널은 항상 마운트된 채 transform 만 바뀌므로 전략 변경 시 깜빡임이 없다 */}
      {createPortal(
        <>
          <button
            type="button"
            className={cx(styles.edgeTab, panelOpen && styles.edgeTabHidden)}
            onClick={() => setPanelOpen(true)}
            aria-expanded={panelOpen}
            aria-label="계좌 전략 설계 방식 열기"
          >
            <SlidersHorizontal size={14} strokeWidth={2.4} />
            <span className={styles.edgeTabLabel}>계좌 전략</span>
          </button>

          {panelOpen && <div className={styles.panelBackdrop} onClick={() => setPanelOpen(false)} aria-hidden="true" />}

          <aside className={cx(styles.panel, panelOpen && styles.panelOn)} aria-label="설계 방식" aria-hidden={!panelOpen}>
            <div className={styles.panelHead}>
              <SlidersHorizontal size={14} strokeWidth={2.4} />
              <span>설계 방식</span>
              <button type="button" className={styles.panelClose} onClick={() => setPanelOpen(false)} aria-label="닫기">
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>

            <div className={styles.panelBody}>
              <p className={styles.prefIntro}>
                기본은 CUBE 추천 전략이에요. 목적이 다르면 아래에서 전략을 바꿔 주세요. 선택하면 왼쪽 흐름도가 바로 바뀌어요.
              </p>

              {/* 전략 3택 1 — 결과가 실제로 다른 세 전략만 단일 리스트로 노출.
               *  1번(CUBE 추천)은 브랜드 큐브 + 강조 스타일로 기본값임을 드러낸다 */}
              <div className={styles.modeList} role="radiogroup" aria-label="계좌 전략">
                {STRATEGIES.map((s) => {
                  const on = strategyId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={cx(styles.modeCard, s.cube && styles.modeCardCube, on && styles.modeCardOn)}
                      onClick={() => pickStrategy(s)}
                    >
                      {s.cube ? (
                        /* 브랜드 큐브 — CUBE 추천의 정체성. 조립되며 도는 미니 루빅스 큐브 */
                        <span className={cx(styles.modeIcon, styles.modeIconCube)} aria-hidden="true">
                          <CubeLoader size={15} bare />
                        </span>
                      ) : (
                        <span className={styles.modeIcon}>
                          <s.Icon size={16} strokeWidth={2.2} />
                        </span>
                      )}
                      <span className={styles.modeText}>
                        {/* 뱃지는 제목 위 독립 줄 — 제목 옆에 붙이면 좁은 패널(체크 아이콘 포함 시)에서
                         *  글자 중간 개행("우/선", "추/천")이 생긴다 */}
                        {s.cube && <em className={styles.modeBadge}>CUBE 추천</em>}
                        <b className={styles.modeName}>{s.name}</b>
                        <span className={styles.modeDesc}>{s.desc}</span>
                      </span>
                      {on && <Check size={16} strokeWidth={2.8} className={styles.modeCheck} />}
                    </button>
                  );
                })}
              </div>

              {/* 선택 전략 적용 요약 — 납입 순서와 환급 효과 */}
              <p className={styles.prefDesc}>{prefSummary}</p>

              {/* 금융선호도 — 데이터·로직 미정의, 자리만 예고 */}
              <div className={cx(styles.prefLabel, styles.prefLabelDim)}>
                금융 선호도 <span className={styles.soon}>준비 중</span>
              </div>
              <div className={styles.prefSoonRow} aria-disabled="true">
                <Lock size={13} strokeWidth={2.2} />
                <span>선호 상품(ETF·국내/미국 등)에 따라 담을 수 있는 절세 계좌를 추려드릴 예정이에요.</span>
              </div>
            </div>
          </aside>
        </>,
        document.body
      )}
    </Pad>
  );
}
