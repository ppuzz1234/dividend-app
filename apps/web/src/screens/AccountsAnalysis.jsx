import { useMemo } from "react";
import { ArrowRight, ArrowDown, Sparkles } from "lucide-react";
import { buildAccountRooms } from "@devidend/core";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./AccountsAnalysis.module.css";

/* 납입 우선순위(3종) — 세후 시뮬레이션 검증 결과: 연금저축 → ISA → IRP */
const PRIORITY = ["pensionSavings", "isa", "irp"];
const SHORT = { pensionSavings: "연금", isa: "ISA", irp: "IRP" };
const WHY = {
  pensionSavings: "환급률이 가장 높아 1순위로 채워요",
  isa: "전액 주식 투자·3년 롤오버로 2순위예요",
  irp: "안전자산 30% 제한이 있어 3순위예요",
};
const LEVEL_TAG = { good: "양호", warn: "개선 여지", act: "조치 필요" };

/* 계좌별 신호등 상태 도출 — 남은 여력이 아니라 '이 계좌로 달성 가능한 총 납입금(연 한도)과
 *  그에 따른 총 환급 예상액(한도 × 세액공제율)'을 기준으로 표기한다. */
function analyze(r) {
  if (r.roomType === "deduct") {
    const level = r.held === false ? "act" : r.room <= 0 ? "good" : "warn";
    const note =
      r.held === false
        ? `지금 개설하면 연 ${fmtKRW(r.limit)} 납입으로 매년 ${fmtKRW(r.maxRefund)}을 환급받을 수 있어요.`
        : r.room <= 0
          ? `연 ${fmtKRW(r.limit)}을 모두 채워 매년 ${fmtKRW(r.maxRefund)}을 돌려받고 있어요.`
          : `이 계좌로 연 ${fmtKRW(r.limit)}까지 납입하면 매년 ${fmtKRW(r.maxRefund)}을 세액공제로 돌려받아요.`;
    return { level, note };
  }
  // ISA(limit) — 세액공제가 아닌 비과세이므로 총 납입 가능액과 비과세 혜택으로 표기
  const level = r.held === false ? "act" : r.room <= 0 ? "good" : "warn";
  const note =
    r.held === false
      ? `지금 개설하면 연 ${fmtKRW(r.limit)}까지 비과세로 굴릴 수 있어요.`
      : r.room <= 0
        ? `연 ${fmtKRW(r.limit)} 비과세 한도를 모두 활용하고 있어요.`
        : `이 계좌로 연 ${fmtKRW(r.limit)}까지 담아 순이익 200만원을 비과세로 받을 수 있어요.`;
  return { level, note };
}

/* ③ 3종 계좌 최적화 분석 — 어떤 계좌부터 납입할지(우선순위)와 각 계좌가 지금
 *  잘 관리되고 있는지를 신호등 색으로 직관적으로 보여주고, 옆에 짧은 설명을 단다.
 *  (첨부 이미지의 '흐름'만 참조 — 디자인은 신규) */
export function AccountsAnalysis({ mydata, manualAccounts, income, onNext }) {
  const { rooms } = useMemo(
    () => buildAccountRooms({ mydata, manual: manualAccounts, income, monthlyContribution: 0 }),
    [mydata, manualAccounts, income]
  );

  const items = useMemo(
    () =>
      PRIORITY.map((id, i) => {
        const r = rooms.find((x) => x.id === id) || { id };
        const pct = Math.max(0, Math.min(100, r.pct ?? 0));
        return { id, rank: i + 1, name: r.name ?? SHORT[id], pct, held: r.held ?? null, ...analyze(r) };
      }),
    [rooms]
  );

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

      {/* 우선순위 흐름 — 노드(신호등) + 오른쪽 설명 */}
      <div className={styles.flow}>
        {items.map((it, i) => {
          return (
            <div key={it.id} className={styles.row} style={{ animationDelay: `${i * 130}ms` }}>
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
                <p className={styles.why}>{WHY[it.id]}</p>
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
    </Pad>
  );
}
