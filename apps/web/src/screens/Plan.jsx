import { ArrowRight, RefreshCw, PiggyBank } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Label } from "../components/ui/Label.jsx";
import { Switch } from "../components/ui/Switch.jsx";
import { ACCOUNTS } from "@devidend/core";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./Plan.module.css";

const byId = Object.fromEntries(ACCOUNTS.map((a) => [a.id, a]));

/* ⑤ 올해 투자 방향 — 배분안(allocate) 확인 + 기간·재투자 확정 */
export function Plan({ allocation, strategy, riskProfile, years, setYears, reinvest, setReinvest, onNext }) {
  const rows = allocation.plan.filter((p) => p.seed > 0 || p.monthly > 0);
  const totalSeed = rows.reduce((s, p) => s + p.seed, 0);
  const totalMonthly = rows.reduce((s, p) => s + p.monthly, 0);

  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>이 배분안으로 종목 고르기</Button>}>
      <Heading sub="여력을 절세 우선순위(연금 세액공제 → ISA 비과세 → 일반)로 나눴어요.">
        올해 투자 방향
      </Heading>

      {riskProfile && (
        <div className={styles.profileNote}>
          <span className={styles.typeChip}>{riskProfile.typeLabel}</span>
          {riskProfile.cautions.map((c, i) => (
            <span key={i} className={styles.caution}>{c}</span>
          ))}
        </div>
      )}

      {strategy.totalRefund > 0 && (
        <div className={styles.refund}>
          <PiggyBank size={17} />
          이대로 납입하면 내년 초 세액공제 환급 약 <strong>{fmtKRW(strategy.totalRefund)}</strong>
        </div>
      )}

      <div className={styles.sumHead}>
        <Label>계좌별 배분</Label>
        <span className={styles.sumTxt}>
          시드 {fmtKRW(totalSeed)} · 월 {fmtKRW(totalMonthly)}
        </span>
      </div>
      <div className={styles.list}>
        {rows.map((p) => {
          const acc = byId[p.accountId] || {};
          const seedPct = totalSeed > 0 ? Math.round((p.seed / totalSeed) * 100) : 0;
          return (
            <div key={p.accountId} className={styles.row}>
              <div className={styles.rowTop}>
                <span className={styles.name}>{acc.name}</span>
                <span className={styles.pct}>{seedPct}%</span>
              </div>
              <div className={styles.bar}>
                <div className={styles.barFill} style={{ width: `${seedPct}%` }} />
              </div>
              <div className={styles.amts}>
                <span>시드 {fmtKRW(p.seed)}</span>
                <span>월 {fmtKRW(p.monthly)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <Label top>투자 기간</Label>
      <div className={styles.periodVal}>
        <span className={styles.years}>{years}</span>
        <span className={styles.unit}>년</span>
      </div>
      <input
        type="range"
        className="rng"
        min={1}
        max={40}
        step={1}
        value={years}
        onChange={(e) => setYears(Number(e.target.value))}
        style={{ width: "100%" }}
      />

      <button onClick={() => setReinvest((v) => !v)} className={cx(styles.drip, reinvest && styles.dripOn)}>
        <RefreshCw size={22} color={reinvest ? C.jade : C.faint} />
        <span className={styles.dripText}>
          <span className={styles.dripTitle}>배당금 재투자 (DRIP)</span>
          <span className={styles.dripDesc}>받은 배당으로 다시 매수해 복리로 굴려요</span>
        </span>
        <Switch on={reinvest} />
      </button>
    </Pad>
  );
}
