import { ArrowRight, Wand2 } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Label } from "../components/ui/Label.jsx";
import { Field } from "../components/ui/Field.jsx";
import { fmtKRW } from "../lib/format.js";
import styles from "./Capacity.module.css";

const digits = (v) => Number(String(v).replace(/\D/g, "")) || 0;

/* ② 투자 여력 판단 — 진단(core/capacity)은 제안까지, 확정은 슬라이더로 */
export function Capacity({ cap, monthlyExpense, setMonthlyExpense, cash, setCash, seed, setSeed, monthly, setMonthly, onNext }) {
  const apply = () => {
    setSeed(cap.suggestedSeed);
    setMonthly(cap.suggestedMonthly);
  };

  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>이 여력으로 절세 분석</Button>}>
      <Heading sub="지출과 보유 현금으로 무리 없는 투자 여력을 진단해요.">올해 투자 여력</Heading>

      <Label>월 고정지출 · 투입 가능 현금</Label>
      <div className={styles.inputRow}>
        <Field
          label="월 지출 (만원)"
          value={monthlyExpense ? String(monthlyExpense / 10000) : ""}
          onChange={(v) => setMonthlyExpense(digits(v) * 10000)}
          placeholder="250"
          inputMode="numeric"
        />
        <Field
          label="보유 현금 (만원)"
          value={cash ? String(cash / 10000) : ""}
          onChange={(v) => setCash(digits(v) * 10000)}
          placeholder="3000"
          inputMode="numeric"
        />
      </div>

      {/* 진단 결과 */}
      <div className={styles.diag}>
        <div className={styles.diagRow}>
          <span>월 여유 현금흐름</span>
          <strong>{fmtKRW(cap.surplus)}</strong>
        </div>
        <div className={styles.diagRow}>
          <span>비상금 제외 투입 가능 현금</span>
          <strong>{fmtKRW(cap.investableCash)}</strong>
        </div>
        <div className={styles.diagTotal}>
          <span>올해 총 투입 여력</span>
          <strong>{fmtKRW(cap.annualCapacity)}</strong>
        </div>
        <button onClick={apply} className={styles.applyBtn}>
          <Wand2 size={15} />
          제안값 적용 — 시드 {fmtKRW(cap.suggestedSeed)} · 월 {fmtKRW(cap.suggestedMonthly)}
        </button>
      </div>

      {/* 확정 슬라이더 */}
      <Label top>초기 시드</Label>
      <div className={styles.sliderVal}>{fmtKRW(seed)}</div>
      <input
        type="range"
        className="rng"
        min={0}
        max={200000000}
        step={1000000}
        value={seed}
        onChange={(e) => setSeed(Number(e.target.value))}
        style={{ width: "100%" }}
      />

      <Label top>매월 불입금</Label>
      <div className={styles.sliderVal}>{fmtKRW(monthly)}</div>
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
    </Pad>
  );
}
