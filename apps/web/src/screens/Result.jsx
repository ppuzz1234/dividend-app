import { useMemo, useState } from "react";
import { ArrowRight, AlertTriangle, Sparkles, RefreshCw } from "lucide-react";
import { buildAccountRooms, deductionRate } from "@devidend/core";
import { OrderConfirmSheet } from "./OrderConfirmSheet.jsx";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Segmented } from "../components/ui/Segmented.jsx";
import { Tag } from "../components/ui/Tag.jsx";
import { useCountUp } from "../hooks/useCountUp.js";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./Result.module.css";

export function Result({ sim, allocation, chosen, years, reinvest, age, goalNestEgg, monthlyGoal, manualAccounts, income = 50_000_000, taxPref = "growth", isaRollover = "isa1", liquidity = null, perAccount = null, monthlyContribution = 0, existingAssets = 0, productAlloc = {}, cycle = "weekly", onNext }) {
  /* 기존 보유자산은 현재가치로(성장 없이) 목표에 합산한다 —
   * 시뮬(sim)은 월 납입 성장분만 담고 있어(App 에서 시드 0), 이중 성장을 피한다.
   * → 최종 평가금액 = 기존 자산(정적) + 월 납입 성장분. */
  const finalValue = sim.finalValue + existingAssets;
  const contributed = sim.contributed + existingAssets;
  const val = useCountUp(finalValue, 1100);
  const returnPct = contributed > 0 ? (finalValue / contributed - 1) * 100 : 0;
  const [confirmOpen, setConfirmOpen] = useState(false); // 배분·투자 확인 시트

  /* 추천 배당 솔루션 — 은퇴 시점에 모은 자산(finalValue)을 고배당 상품으로 전환했을 때의
   * 연/월 배당액. 배당 ETF(연 4%) 또는 커버드콜 ETF(연 10%) 중 선택. */
  const [divType, setDivType] = useState("cc");
  const divRate = divType === "cc" ? 0.1 : 0.04;
  const annualDiv = Math.round((finalValue * divRate) / 10000) * 10000;
  const monthlyDiv = Math.round(annualDiv / 12 / 10000) * 10000;
  const goalMonthlyWon = (monthlyGoal || 0) * 10000;
  const coverPct = goalMonthlyWon > 0 ? Math.round((monthlyDiv / goalMonthlyWon) * 100) : null;

  /* 계좌별 절세·세액공제 — (a) '올해 총 세액공제' 기준.
   *  연금저축·IRP: 당해 기납(used) + 이번 배분 공제분(planAnnual)을 세액공제 한도(limit) 내에서
   *  합산해 공제율을 곱한다 → 이미 낸 기납분의 공제까지 포함한다.
   *  ISA: 순이익 200만원 비과세 상당액(estSaving)을 보유/배분이 있을 때만 반영. */
  const deductRate = deductionRate(income);
  const taxSaving = useMemo(() => {
    const { rooms } = buildAccountRooms({ mydata: true, manual: manualAccounts, income, age, monthlyContribution, taxPref, isaRollover, liquidity, perAccount });
    const rows = rooms
      .map((r) => {
        // 올해 공제 대상 납입액 = 기납 + 배분 공제분 (세액공제 한도 내). 기납+배분이 한도를 넘지 않도록 clamp.
        const deductibleAnnual = Math.min((r.used || 0) + (r.planAnnual || 0), r.limit || 0);
        const hasIsa = r.id === "isa" && ((r.planTotalAnnual || 0) > 0 || (r.used || 0) > 0);
        const raw =
          r.roomType === "deduct" ? deductibleAnnual * deductRate : hasIsa ? r.estSaving || 0 : 0;
        // 만원 단위로 반올림 — 계좌별 표시값의 합이 절세 총액과 정확히 일치하도록.
        const benefit = Math.round(raw / 10000) * 10000;
        const label = r.roomType === "deduct" ? "세액공제" : r.id === "isa" ? "비과세 절세" : null;
        return { id: r.id, name: r.name, monthly: Math.round(r.planMonthly || 0), benefit, label };
      })
      .filter((r) => r.benefit > 0);
    const total = rows.reduce((s, r) => s + r.benefit, 0);
    return { rows, total };
  }, [manualAccounts, income, age, monthlyContribution, deductRate, taxPref, isaRollover, liquidity, perAccount]);

  return (
    <Pad footer={<Button onClick={() => setConfirmOpen(true)} variant="primary" icon={ArrowRight}>배분 · 투자하기</Button>}>
      <div className={styles.mintScope}>
      <Heading>{years}년 뒤 예상 결과</Heading>

      {/* 히어로: 최종 평가금액 + 온보딩에서 정한 목표 대비 달성률 (최상단) */}
      <div className={styles.hero}>
        <div className={styles.heroLabel}>최종 예상 평가금액</div>
        <div className={styles.heroValue}>{fmtKRW(val)}</div>
        {goalNestEgg > 0 && (
          <div className={styles.goalRow}>
            <span>
              목표 <b>{fmtKRW(goalNestEgg)}</b>
              {monthlyGoal ? ` (월 ${monthlyGoal.toLocaleString()}만원 생활비)` : ""}
            </span>
            <b className={finalValue >= goalNestEgg ? styles.goalOk : styles.goalShort}>
              달성률 {Math.round((finalValue / goalNestEgg) * 100)}%
            </b>
          </div>
        )}
        <div className={styles.miniRow}>
          <Mini label="총 납입금" v={fmtKRW(contributed)} />
          <Mini label="투자 수익" v={`+${returnPct.toFixed(0)}%`} tone="gold" />
        </div>
      </div>

      {/* 핵심 인사이트: 계좌별 절세·세액공제 (절세 총액 + 계좌별 내역) */}
      <TaxSaving rows={taxSaving.rows} total={taxSaving.total} deductRate={deductRate} />

      {/* 추천 배당 솔루션 — 모은 자산을 은퇴 후 고배당 상품으로 전환하는 전략 시뮬 */}
      <section className={styles.divSol}>
        <div className={styles.insHead}>
          <span className={styles.insBadge}>
            <Sparkles size={13} strokeWidth={2.6} /> 추천 배당 솔루션
          </span>
          <h2 className={styles.insTitle}>은퇴 후엔 모은 자산을 배당으로 바꿔요</h2>
          <p className={styles.insSub}>
            은퇴 전까지는 성장주 ETF로 자산을 키우고, 모은 <b>{fmtKRW(finalValue)}</b>을 은퇴 시점에 고배당 상품으로
            전환해 매달 배당으로 생활비를 만들어요.
          </p>
        </div>

        <div className={styles.divSegWrap}>
          <Segmented
            value={divType}
            onChange={setDivType}
            opts={[
              { v: "cc", l: "커버드콜 ETF · 연 10%" },
              { v: "div", l: "배당 ETF · 연 4%" },
            ]}
          />
        </div>

        <div className={styles.divHero}>
          <span className={styles.divCap}>전환 시 예상 연 배당액</span>
          <b className={styles.divAnnual}>{fmtKRW(annualDiv)}</b>
          <span className={styles.divMonthly}>월 환산 약 {fmtKRW(monthlyDiv)}</span>
        </div>

        {coverPct != null && (
          <div className={styles.divGoal}>
            목표 월 생활비 {monthlyGoal.toLocaleString()}만원의 <b>{coverPct}%</b>를 배당으로 충당해요
          </div>
        )}

        <p className={styles.insNote}>
          {divType === "cc"
            ? "커버드콜 ETF는 월배당·고분배로 현금흐름이 크지만, 상승장에서 주가 상승이 제한되고 분배율이 변동될 수 있어요. "
            : "배당 ETF는 변동성이 상대적으로 낮지만, 배당은 시장 상황에 따라 달라질 수 있어요. "}
          전환 금액은 은퇴 시점 평가액 가정이며, 실제 배당은 상품·시장에 따라 달라져요.
        </p>
      </section>

      {/* 가정·세금 */}
      <div className={styles.assume}>
        <div className={styles.assumeTitle}>적용 가정</div>
        <Row k="포트폴리오 배당수익률" v={`${(sim.blended.y0 * 100).toFixed(1)}%`} />
        <Row k="연 배당성장률" v={`${(sim.blended.g * 100).toFixed(1)}%`} />
        <Row k="연 주가상승률(가정)" v={`${(sim.blended.p * 100).toFixed(1)}%`} />
        <Row k="계좌 · 배당세" v={`${sim.account.name} · ${(sim.taxRate * 100).toFixed(1)}%`} />
        <Row k="배당 재투자" v={reinvest ? "적용" : "미적용"} last />
      </div>

      {/* 계좌별 배분 · 절세 분석 */}
      <div className={styles.assume}>
        <div className={styles.assumeTitle}>계좌별 배분 · 절세</div>
        {sim.perAccount.map((a) => (
          <Row key={a.accountId} k={a.account.name} v={fmtKRW(a.finalValue)} />
        ))}
        <Row k="절세효과 (일반계좌 대비)" v={`+${fmtKRW(sim.taxSaved)}`} />
        {sim.pensionWithdrawalTax > 0 && (
          <Row k="연금 인출세 추정" v={`-${fmtKRW(sim.pensionWithdrawalTax)}`} />
        )}
        <Row k="세후 실수령 추정" v={fmtKRW(sim.netFinalValue)} last />
      </div>

      {(sim.compTaxWarning || sim.isaInPlan || allocation?.warnings?.length > 0) && (
        <div className={styles.notes}>
          {sim.compTaxWarning && (
            <div className={styles.note}>
              <AlertTriangle size={14} /> 일반계좌 연 배당이 2,000만원을 넘어 금융소득종합과세 대상이 될 수 있어요 (배당가산율 11% 적용).
            </div>
          )}
          {sim.isaEligibilityRisk && (
            <div className={styles.note}>
              <AlertTriangle size={14} /> 금융소득종합과세 대상(직전 3년 내 연 금융소득 2,000만 초과)이 되면 만기 후 ISA 재가입이 막혀 혜택이 끊길 수 있어요.
            </div>
          )}
          {sim.isaInPlan && (
            <div className={cx(styles.note, styles.noteInfo)}>
              <RefreshCw size={14} /> ISA는 {sim.isaCycle}년 만기마다 순이익 200만까지 비과세로 정산하고 재가입(롤오버)해요 — {years}년이면 약 {sim.isaRolloverCount}회, 이 비과세·과세이연 효과가 결과에 반영됐어요.
            </div>
          )}
          {allocation?.warnings?.map((w, i) => (
            <div key={i} className={styles.note}>
              <AlertTriangle size={14} /> {w}
            </div>
          ))}
        </div>
      )}

      <div className={styles.chips}>
        {chosen.map((s) => (
          <Tag key={s.id} tone={s.region === "US" ? "gold" : "jade"}>
            {s.name}
          </Tag>
        ))}
      </div>
      <p className={styles.disclaimer}>
        예시 가정치를 적용한 추정 결과로, 실제 수익률·배당은 시장 상황에 따라 달라지며 손실이 발생할 수 있습니다. 투자 권유가 아닙니다.
      </p>
      </div>

      {/* 배분·투자 확인 시트 — 필수 확인 2건 모두 체크 시 최종 진행(→ 자산 탭) */}
      {confirmOpen && (
        <OrderConfirmSheet
          alloc={productAlloc}
          cycle={cycle}
          onConfirm={() => {
            setConfirmOpen(false);
            onNext?.();
          }}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </Pad>
  );
}


/* 계좌별 절세·세액공제 — 절세 총액(상단) + 계좌별 월 납입 → 연 절세/세액공제(하단) */
function TaxSaving({ rows, total, deductRate }) {
  if (!rows.length) return null;
  return (
    <section className={styles.insight}>
      <div className={styles.insHead}>
        <span className={styles.insBadge}>
          <Sparkles size={13} strokeWidth={2.6} /> 핵심 인사이트
        </span>
        <h2 className={styles.insTitle}>
          절세 계좌를 채우면 <b className={styles.insTotal}>연 {fmtKRW(total)}</b> 절세돼요
        </h2>
      </div>

      {/* 계좌별 내역 — 월 납입(배분 계획) + 올해 총 공제대상(기납+배분, 한도 내)에 따른 연 절세/세액공제 */}
      <div className={styles.saveGrid}>
        {rows.map((r) => (
          <div key={r.id} className={styles.saveCell}>
            <div className={styles.saveCellTop}>
              <span className={styles.saveName}>{r.name}</span>
              {r.benefit > 0 ? (
                <b className={styles.saveAmt}>+{fmtKRW(r.benefit)}</b>
              ) : (
                <span className={styles.saveNone}>혜택 없음</span>
              )}
            </div>
            <div className={styles.saveCellBot}>
              <span className={styles.saveMonthly}>월 {fmtKRW(r.monthly)}</span>
              {r.label && <span className={styles.saveLabel}>{r.label}</span>}
            </div>
          </div>
        ))}
      </div>

      <p className={styles.insNote}>
        세액공제율 {(deductRate * 100).toFixed(1)}%(총급여 기준)·ISA 비과세 반영. 올해 납입액(기납+배분, 한도 내) 기준
        단순화 추정치예요.
      </p>
    </section>
  );
}

function Mini({ label, v, tone }) {
  return (
    <div className={styles.mini}>
      <div className={styles.miniLabel}>{label}</div>
      <div className={cx(styles.miniVal, tone === "gold" && styles.miniValGold)}>{v}</div>
    </div>
  );
}

function Row({ k, v, last }) {
  return (
    <div className={cx(styles.row, last && styles.rowLast)}>
      <span className={styles.rowK}>{k}</span>
      <span className={styles.rowV}>{v}</span>
    </div>
  );
}

