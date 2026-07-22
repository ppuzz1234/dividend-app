import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  ArrowRight,
  CircleDollarSign,
  Wallet,
  PiggyBank,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { buildAccountRooms, deductionRate } from "@devidend/core";
import { OrderConfirmSheet } from "./OrderConfirmSheet.jsx";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Tag } from "../components/ui/Tag.jsx";
import { useCountUp } from "../hooks/useCountUp.js";
import { fmtKRW, fmtShort } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./Result.module.css";

/* 이 페이지 한정 청녹(민트/틸) 팔레트 — CSS의 .mintScope 오버라이드와 값 동기화.
   차트·아이콘은 CSS 변수가 아닌 JS 색상 문자열을 쓰므로 여기서 별도 치환. */
const MINT = {
  main: "#2dd4bf", // = --jade
  mainDeep: "#14b8a6", // = --jade-deep
  sub: "#34d399", // = --gold
};

export function Result({ sim, allocation, chosen, years, reinvest, goalNestEgg, monthlyGoal, manualAccounts, income = 50_000_000, monthlyContribution = 0, existingAssets = 0, productAlloc = {}, onNext }) {
  /* 기존 보유자산은 현재가치로(성장 없이) 목표에 합산한다 —
   * 시뮬(sim)은 월 납입 성장분만 담고 있어(App 에서 시드 0), 이중 성장을 피한다.
   * → 최종 평가금액 = 기존 자산(정적) + 월 납입 성장분. */
  const finalValue = sim.finalValue + existingAssets;
  const contributed = sim.contributed + existingAssets;
  const val = useCountUp(finalValue, 1100);
  const returnPct = contributed > 0 ? (finalValue / contributed - 1) * 100 : 0;
  // 차트에도 기존 자산을 원금(정적) 베이스로 깔아 히어로 금액과 상단선을 일치시킨다
  const series =
    existingAssets > 0
      ? sim.series.map((d) => ({ ...d, value: d.value + existingAssets, principal: d.principal + existingAssets }))
      : sim.series;
  const [confirmOpen, setConfirmOpen] = useState(false); // 배분·투자 확인 시트

  /* 계좌별 절세·세액공제 — 배분(buildAccountRooms)의 계좌별 월 납입과
   * 세제 혜택(연금·IRP 세액공제 / ISA 비과세 절세)을 계좌별로 정리하고 합계(절세 총액)를 낸다. */
  const deductRate = deductionRate(income);
  const taxSaving = useMemo(() => {
    const { rooms } = buildAccountRooms({ mydata: true, manual: manualAccounts, income, monthlyContribution });
    const rows = rooms
      .filter((r) => (r.planTotalAnnual || 0) > 0)
      .map((r) => {
        // 세액공제(연금저축·IRP)는 공제분(planAnnual)에만, ISA는 비과세 절세 상당(estSaving).
        // 만원 단위로 반올림 — 계좌별 표시값의 합이 절세 총액과 정확히 일치하도록.
        const raw = r.roomType === "deduct" ? (r.planAnnual || 0) * deductRate : r.id === "isa" ? r.estSaving || 0 : 0;
        const benefit = Math.round(raw / 10000) * 10000;
        const label = r.roomType === "deduct" ? "세액공제" : r.id === "isa" ? "비과세 절세" : null;
        return { id: r.id, name: r.name, monthly: Math.round(r.planMonthly || 0), benefit, label };
      });
    const total = rows.reduce((s, r) => s + r.benefit, 0);
    return { rows, total };
  }, [manualAccounts, income, monthlyContribution, deductRate]);

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

      {/* 눈덩이 차트 */}
      <div className={styles.chartCard}>
        <div className={styles.legendRow}>
          <Legend tone="principal" t="납입 원금" />
          <Legend tone="gain" t="수익 · 배당" />
        </div>
        <div className={styles.chartBox}>
          <ResponsiveContainer>
            <AreaChart data={series} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MINT.main} stopOpacity={0.7} />
                  <stop offset="100%" stopColor={MINT.main} stopOpacity={0.08} />
                </linearGradient>
                <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MINT.sub} stopOpacity={0.75} />
                  <stop offset="100%" stopColor={MINT.sub} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fill: C.faint, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(y) => (y === 0 ? "지금" : `${y}년`)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: C.faint, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={fmtShort}
              />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="principal" stackId="1" stroke={MINT.mainDeep} strokeWidth={2} fill="url(#gP)" />
              <Area type="monotone" dataKey="gain" stackId="1" stroke={MINT.sub} strokeWidth={2} fill="url(#gG)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 배당 스탯 */}
      <div className={styles.statGrid}>
        <Stat icon={CircleDollarSign} label={`${years}년차 연 배당금`} v={fmtKRW(sim.annualIncome)} tone="gold" />
        <Stat icon={Wallet} label="월 환산 배당" v={fmtKRW(sim.monthlyIncome)} tone="gold" />
        <Stat icon={PiggyBank} label="누적 수령 배당" v={fmtKRW(sim.cumDiv)} />
        <Stat icon={TrendingUp} label="원가대비 배당률" v={`${(sim.yoc * 100).toFixed(1)}%`} />
      </div>

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
        <h2 className={styles.insTitle}>계좌 배분만으로 매년 이만큼 절세돼요</h2>
        <p className={styles.insSub}>계좌별 납입액 기준 · 연간 절세·세액공제 혜택</p>
      </div>

      {/* 절세 총액 (상단) — 계좌별 혜택의 합계 */}
      <div className={styles.saveTotal}>
        <PiggyBank size={20} strokeWidth={2.4} />
        <span className={styles.saveTotalCap}>연간 절세 총액</span>
        <strong className={styles.saveTotalVal}>{fmtKRW(total)}</strong>
      </div>

      {/* 계좌별 내역 (하단) — 월 납입 → 연 절세/세액공제 */}
      <div className={styles.saveList}>
        {rows.map((r) => (
          <div key={r.id} className={styles.saveRow}>
            <div className={styles.saveAcct}>
              <span className={styles.saveName}>{r.name}</span>
              <span className={styles.saveMonthly}>월 {fmtKRW(r.monthly)} 납입</span>
            </div>
            {r.benefit > 0 ? (
              <div className={styles.saveBenefit}>
                <b className={styles.saveAmt}>+{fmtKRW(r.benefit)}</b>
                <span className={styles.saveLabel}>연 {r.label}</span>
              </div>
            ) : (
              <span className={styles.saveNone}>절세 혜택 없음</span>
            )}
          </div>
        ))}
      </div>

      <p className={styles.insNote}>
        ※ 세액공제율 {(deductRate * 100).toFixed(1)}%(총급여 기준) 적용 · ISA는 순이익 200만 비과세 상당. 단순화 추정치이며 세무 자문이 아닙니다.
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

function Legend({ tone, t }) {
  return (
    <span className={styles.legend}>
      <span className={cx(styles.legendDot, tone === "gain" ? styles.dotGain : styles.dotPrincipal)} />
      {t}
    </span>
  );
}

function Stat({ icon: Icon, label, v, tone }) {
  return (
    <div className={styles.stat}>
      <Icon size={18} color={tone === "gold" ? MINT.sub : MINT.main} />
      <div className={styles.statLabel}>{label}</div>
      <div className={cx(styles.statVal, tone === "gold" && styles.statValGold)}>{v}</div>
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

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className={styles.tip}>
      <div className={styles.tipLabel}>{label === 0 ? "지금" : `${label}년 후`}</div>
      <div className={styles.tipVal}>{fmtKRW(d.value)}</div>
      <div className={styles.tipSub}>
        원금 {fmtKRW(d.principal)} · 수익 {fmtKRW(d.gain)}
      </div>
      <div className={styles.tipGold}>연 배당 {fmtKRW(d.income)}</div>
    </div>
  );
}
