import { useMemo, useState, useEffect } from "react";
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
  ReceiptText,
  HeartPulse,
  RefreshCw,
  ChevronRight,
  X,
  ShieldCheck,
} from "lucide-react";
import { compareDividendTax } from "@devidend/core";
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

export function Result({ sim, allocation, chosen, years, reinvest, age = 65, goalNestEgg, monthlyGoal, onNext }) {
  const val = useCountUp(sim.finalValue, 1100);
  const returnPct = (sim.finalValue / sim.contributed - 1) * 100;
  // 은퇴 후 이 배당을 어느 계좌에서 받느냐 — 소득세·건보료 비교 인사이트
  const cmp = useMemo(() => compareDividendTax({ annualDividend: sim.annualIncome, age }), [sim.annualIncome, age]);

  return (
    <Pad footer={<Button onClick={onNext} variant="primary" icon={ArrowRight}>종목 고르러 가기</Button>}>
      <div className={styles.mintScope}>
      <Heading>{years}년 뒤 예상 결과</Heading>

      {/* 핵심 인사이트: 배당 수령 계좌별 세금·건강보험료 비교 */}
      <TaxInsight cmp={cmp} />


      {/* 히어로: 최종 평가금액 + 온보딩에서 정한 목표 대비 달성률 */}
      <div className={styles.hero}>
        <div className={styles.heroLabel}>최종 예상 평가금액</div>
        <div className={styles.heroValue}>{fmtKRW(val)}</div>
        {goalNestEgg > 0 && (
          <div className={styles.goalRow}>
            <span>
              목표 <b>{fmtKRW(goalNestEgg)}</b>
              {monthlyGoal ? ` (월 ${monthlyGoal.toLocaleString()}만원 생활비)` : ""}
            </span>
            <b className={sim.finalValue >= goalNestEgg ? styles.goalOk : styles.goalShort}>
              달성률 {Math.round((sim.finalValue / goalNestEgg) * 100)}%
            </b>
          </div>
        )}
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
    </Pad>
  );
}

/* 배당 수령 계좌별 소득세·건강보험료 비교 인사이트 */
function TaxInsight({ cmp }) {
  const { annual, general, pension, diff, mechanisms, assumptions } = cmp;
  const [infoAcct, setInfoAcct] = useState(null); // 상세보기 팝업(계좌 데이터 | null)

  useEffect(() => {
    if (!infoAcct) return;
    const onKey = (e) => e.key === "Escape" && setInfoAcct(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [infoAcct]);

  return (
    <section className={styles.insight}>
      <div className={styles.insHead}>
        <span className={styles.insBadge}>
          <Sparkles size={13} strokeWidth={2.6} /> 핵심 인사이트
        </span>
        <h2 className={styles.insTitle}>이 배당, 어느 계좌에서 받느냐가 현금흐름을 가릅니다</h2>
        <p className={styles.insSub}>은퇴 후 수령 기준 · 계좌별 소득세·건강보험료 비교</p>
      </div>

      {/* 세전 연 배당액 — 크게 (두 계좌 공통) */}
      <div className={styles.grossBox}>
        <span className={styles.grossCap}>세전 연 배당액</span>
        <strong className={styles.grossVal}>{fmtKRW(annual)}</strong>
      </div>

      <div className={styles.cmpGrid}>
        <CmpCol data={general} tone="danger" title="기존" onDetail={() => setInfoAcct(general)} />
        <div className={styles.flowArrow} aria-hidden="true">
          <ChevronRight size={15} strokeWidth={3} />
          <ChevronRight size={15} strokeWidth={3} />
          <ChevronRight size={15} strokeWidth={3} />
        </div>
        <CmpCol data={pension} tone="jade" title="향후" onDetail={() => setInfoAcct(pension)} />
      </div>

      <div className={styles.diffBar}>
        <PiggyBank size={18} strokeWidth={2.4} />
        <span className={styles.diffText}>
          <span>PLUS CUBE를 통해서 매년</span>
          <span>
            <strong>{fmtKRW(diff.netGain)}</strong> 절세할 수 있습니다
          </span>
        </span>
      </div>

      <ul className={styles.mech}>
        {mechanisms.map((m, i) => (
          <li key={i}>
            <span className={styles.mechNum}>{i + 1}</span>
            {m}
          </li>
        ))}
      </ul>

      <p className={styles.insNote}>※ {assumptions.join(" · ")}. 단순화 추정치이며 세무 자문이 아닙니다.</p>

      {infoAcct && <TaxDetailPopup data={infoAcct} annual={annual} onClose={() => setInfoAcct(null)} />}
    </section>
  );
}

/* 계좌 타일 — 세후 연 수령액(크게) + 실효 요율 + 상세보기 진입 */
function CmpCol({ data, tone, title, onDetail }) {
  const isGood = tone === "jade";
  return (
    <div className={cx(styles.cmpCol, isGood ? styles.cmpGood : styles.cmpBad)}>
      <div className={styles.cmpLabel}>{title}</div>
      <div className={styles.cmpCaption}>{data.caption}</div>

      <div className={styles.cmpNetCap}>세후 연 수령액</div>
      <strong className={styles.cmpNetVal}>{fmtKRW(data.net)}</strong>
      <div className={styles.cmpRate}>실효 부담 {(data.effectiveRate * 100).toFixed(1)}%</div>

      <button type="button" className={styles.detailBtn} onClick={onDetail}>
        상세보기 <ChevronRight size={13} strokeWidth={2.6} />
      </button>
    </div>
  );
}

/* 상세보기 팝업 — 소득세·건강보험료·절세 세법 상세 */
function TaxDetailPopup({ data, annual, onClose }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.popup}
        role="dialog"
        aria-modal="true"
        aria-label={`${data.label} 과세 상세`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.popupClose} aria-label="닫기" onClick={onClose}>
          <X size={16} />
        </button>

        <div className={styles.popTitle}>{data.label}</div>
        <div className={styles.popCaption}>{data.caption}</div>

        <div className={styles.popGross}>
          <span>세전 연 배당액</span>
          <b>{fmtKRW(annual)}</b>
        </div>

        <div className={styles.popSection}>
          <div className={styles.popSecHead}>
            <span className={styles.popSecTitle}>
              <ReceiptText size={14} /> 소득세
            </span>
            <span className={styles.popSecAmt}>{data.incomeTax > 0 ? fmtKRW(data.incomeTax) : "0원"}</span>
          </div>
          <div className={styles.popSecTag}>{data.incomeTaxNote}</div>
          <p className={styles.popDesc}>{data.taxLaw}</p>
        </div>

        <div className={styles.popSection}>
          <div className={styles.popSecHead}>
            <span className={styles.popSecTitle}>
              <HeartPulse size={14} /> 건강보험료
            </span>
            <span className={styles.popSecAmt}>{data.health > 0 ? fmtKRW(data.health) : "0원"}</span>
          </div>
          <div className={styles.popSecTag}>{data.healthNote}</div>
          <p className={styles.popDesc}>{data.healthLaw}</p>
        </div>

        <div className={styles.popNet}>
          <div className={styles.popNetRow}>
            <span>세후 연 수령액</span>
            <strong>{fmtKRW(data.net)}</strong>
          </div>
          <div className={styles.popNetRate}>실효 부담 {(data.effectiveRate * 100).toFixed(1)}%</div>
        </div>

        <div className={styles.popSection}>
          <div className={styles.popSecTitle}>
            <ShieldCheck size={14} /> 절세 포인트
          </div>
          <p className={styles.popDesc}>{data.savingPoint}</p>
        </div>
      </div>
    </div>
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
