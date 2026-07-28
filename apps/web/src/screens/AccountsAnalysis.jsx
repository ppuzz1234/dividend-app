import { useMemo } from "react";
import { ArrowRight, ArrowDown, Sparkles, SlidersHorizontal, Lock } from "lucide-react";
import { buildAccountRooms, deductionRate, TAX_PREFS, ISA_ROLLOVERS } from "@devidend/core";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./AccountsAnalysis.module.css";

/* 납입 우선순위는 엔진(buildAccountRooms)의 priority 를 그대로 따른다 —
 * 절세선호도(taxPref)에 따라 growth: 연금저축→ISA→IRP / refund: 연금저축→IRP→ISA */
const SHORT = { pensionSavings: "연금", isa: "ISA", irp: "IRP" };
const LEVEL_TAG = { good: "양호", warn: "개선 여지", act: "조치 필요" };

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
          ? `비과세 한도의 절반 이상을 채웠어요. 남은 ${fmtKRW(r.room)}까지 더 담으면 순이익 200만원을 비과세로 받아요.`
          : `이 계좌로 연 ${fmtKRW(r.limit)}까지 담아 순이익 200만원을 비과세로 받을 수 있어요.`;
  return { level, note };
}

/* ③ 3종 계좌 최적화 분석 — 상수(나이·소득) 기반 1차 산정을 상단에 보여주고,
 *  하단에서 개인 선호(절세선호도)를 고르면 납입 우선순위가 즉시 재정렬된다.
 *  여기서 고른 선호는 이후 단계(솔루션·배분·실행)의 금액 배분에도 그대로 반영된다. */
export function AccountsAnalysis({ mydata, manualAccounts, income, age, taxPref = "growth", onTaxPref, isaRollover = "isa1", onIsaRollover, onNext }) {
  const { rooms, priority } = useMemo(
    () => buildAccountRooms({ mydata, manual: manualAccounts, income, age, monthlyContribution: 0, taxPref, isaRollover }),
    [mydata, manualAccounts, income, age, taxPref, isaRollover]
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

  /* 선호 선택 효과 요약 — 소득 기준 공제율을 반영한 구체 수치로 */
  const prefSummary = useMemo(() => {
    const rate = deductionRate(income);
    const maxRefund = Math.round(9_000_000 * rate); // 연금저축600+IRP300 공제 한도 총환급
    return taxPref === "refund"
      ? `연금저축·IRP 세액공제 한도(연 900만원)를 먼저 채워, 올해 연말정산에서 최대 ${fmtKRW(maxRefund)}을 돌려받는 순서예요.`
      : `IRP의 안전자산 30% 제한을 피해 ISA를 먼저 채우는, 장기 복리 수익 극대화 순서예요. 세액공제(최대 ${fmtKRW(maxRefund)})는 그다음에 챙겨요.`;
  }, [taxPref, income]);

  // 일반계좌에 절세계좌로 옮기면 유리한 해외ETF 보유가 있으면 인사이트로 노출
  const relocate = useMemo(() => {
    const gen = rooms.find((r) => r.id === "general");
    const foreign = gen?.holdings?.find((h) => h.productType === "foreignEtf" && (h.value || 0) > 0);
    return foreign ? { name: foreign.name, value: foreign.value } : null;
  }, [rooms]);

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
       *  key 에 taxPref 를 넣어 선호 변경 시 등장 애니메이션이 다시 재생되며 재정렬을 보여준다 */}
      <div className={styles.flow}>
        {items.map((it, i) => {
          return (
            <div key={`${taxPref}-${isaRollover}-${it.id}`} className={styles.row} style={{ animationDelay: `${i * 130}ms` }}>
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

      {/* 일반계좌 → 절세계좌 이동 인사이트 */}
      {relocate && (
        <div className={styles.insight}>
          <Sparkles size={15} strokeWidth={2.6} />
          <span>
            일반계좌의 <b>{relocate.name}</b>({fmtKRW(relocate.value)})를 절세계좌로 옮기면 배당세·건강보험료 부담을 줄일 수 있어요.
          </span>
        </div>
      )}

      {/* ── 내 선호 반영 — 1차 산정(상수) 아래에서 개인 변수를 조정한다 ── */}
      <div className={styles.prefSection}>
        <div className={styles.prefHead}>
          <SlidersHorizontal size={14} strokeWidth={2.4} />
          <span>내 선호 반영</span>
        </div>
        <p className={styles.prefIntro}>
          위 순서는 나이·소득 기준의 기본 산정이에요. 아래 선호를 고르면 납입 순서와 이후 단계의 금액 배분이 함께 조정돼요.
        </p>

        {/* 절세선호도 — 올해 세액공제 vs 장기 자산 증식 */}
        <div className={styles.prefLabel}>
          절세 선호도 <span className={styles.soon}>배분 결정</span>
        </div>
        <div className={styles.prefSeg} role="radiogroup" aria-label="절세 선호도">
          {TAX_PREFS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={taxPref === p.id}
              className={cx(styles.prefBtn, taxPref === p.id && styles.prefBtnOn)}
              onClick={() => onTaxPref?.(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className={styles.prefDesc}>{prefSummary}</p>

        {/* ISA 만기(3년) 출구 — 배분 금액에는 영향 없는 보조 설정(만기 자금의 행선지만 결정).
         *  isa3(롤오버 없음)는 배분이 '올해 세액공제 우선'과 동치라 선택지에서 제외해 간소화했다. */}
        <div className={styles.prefLabel}>
          ISA 만기(3년) 출구 <span className={styles.soon}>배분 금액 동일</span>
        </div>
        <div className={styles.prefSeg} role="radiogroup" aria-label="ISA 만기 출구">
          {ISA_ROLLOVERS.filter((p) => p.id !== "isa3").map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={isaRollover === p.id}
              className={cx(styles.prefBtn, isaRollover === p.id && styles.prefBtnOn)}
              onClick={() => onIsaRollover?.(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className={styles.prefDesc}>
          {ISA_ROLLOVERS.find((p) => p.id === isaRollover)?.desc} 매달 나눠 담는 금액은 위의 절세 선호도가 결정해요.
        </p>

        {/* 금융선호도 — 데이터·로직 미정의, 자리만 예고 */}
        <div className={cx(styles.prefLabel, styles.prefLabelDim)}>
          금융 선호도 <span className={styles.soon}>준비 중</span>
        </div>
        <div className={styles.prefSoonRow} aria-disabled="true">
          <Lock size={13} strokeWidth={2.2} />
          <span>선호 상품(ETF·국내/미국 등)에 따라 담을 수 있는 절세 계좌를 추려드릴 예정이에요.</span>
        </div>
      </div>
    </Pad>
  );
}
