import { ArrowRight, RefreshCw } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Label } from "../components/ui/Label.jsx";
import { Switch } from "../components/ui/Switch.jsx";
import { fmtKRW, fmtShort } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./Period.module.css";

const PRESETS = [100000, 300000, 500000, 1000000];

export function Period({ years, setYears, monthly, setMonthly, reinvest, setReinvest, onNext }) {
  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>다음</Button>}>
      <Heading sub="얼마나 오래, 매월 얼마씩 적립할지 정해요.">투자 기간 · 월 불입금</Heading>

      <Label>투자 기간</Label>
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
      <div className={styles.rangeLabels}>
        <span>1년</span>
        <span>40년</span>
      </div>

      <Label top>매월 불입금</Label>
      <div className={styles.monthly}>{fmtKRW(monthly)}</div>
      <input
        type="range"
        className="rng gold"
        min={0}
        max={5000000}
        step={100000}
        value={monthly}
        onChange={(e) => setMonthly(Number(e.target.value))}
        style={{ width: "100%" }}
      />
      <div className={styles.presets}>
        {PRESETS.map((p) => (
          <button key={p} onClick={() => setMonthly(p)} className={cx(styles.preset, monthly === p && styles.presetOn)}>
            {fmtShort(p)}
          </button>
        ))}
      </div>

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
