import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ArrowRight, CircleDollarSign, Wallet, PiggyBank, TrendingUp } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Tag } from "../components/ui/Tag.jsx";
import { useCountUp } from "../hooks/useCountUp.js";
import { fmtKRW, fmtShort } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./Result.module.css";

export function Result({ sim, chosen, years, reinvest, onNext }) {
  const val = useCountUp(sim.finalValue, 1100);
  const returnPct = (sim.finalValue / sim.contributed - 1) * 100;

  return (
    <Pad footer={<Button onClick={onNext} variant="gold" icon={ArrowRight}>요약 보기</Button>}>
      <Heading>{years}년 뒤 예상 결과</Heading>

      {/* 히어로: 최종 평가금액 */}
      <div className={styles.hero}>
        <div className={styles.heroLabel}>최종 예상 평가금액</div>
        <div className={styles.heroValue}>{fmtKRW(val)}</div>
        <div className={styles.miniRow}>
          <Mini label="총 납입금" v={fmtKRW(sim.contributed)} />
          <Mini label="투자 수익" v={`+${returnPct.toFixed(0)}%`} tone="gold" />
        </div>
      </div>

      {/* 눈덩이 차트 */}
      <div className={styles.chartCard}>
        <div className={styles.legendRow}>
          <Legend tone="principal" t="납입 원금" />
          <Legend tone="gain" t="수익 · 배당" />
        </div>
        <div className={styles.chartBox}>
          <ResponsiveContainer>
            <AreaChart data={sim.series} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.jade} stopOpacity={0.7} />
                  <stop offset="100%" stopColor={C.jade} stopOpacity={0.08} />
                </linearGradient>
                <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.gold} stopOpacity={0.75} />
                  <stop offset="100%" stopColor={C.gold} stopOpacity={0.1} />
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
              <Area type="monotone" dataKey="principal" stackId="1" stroke={C.jadeDeep} strokeWidth={2} fill="url(#gP)" />
              <Area type="monotone" dataKey="gain" stackId="1" stroke={C.gold} strokeWidth={2} fill="url(#gG)" />
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
    </Pad>
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
      <Icon size={18} color={tone === "gold" ? C.gold : C.jade} />
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
