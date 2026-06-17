import { ArrowRight } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { fmtKRW, fmtShort } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./Seed.module.css";

const PRESETS = [0, 5000000, 10000000, 30000000, 50000000, 100000000];

export function Seed({ seed, setSeed, onNext }) {
  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>다음</Button>}>
      <Heading sub="지금 한 번에 넣을 시드 금액이에요. 0원으로 두고 매월 적립만 할 수도 있어요.">
        초기 시딩 금액
      </Heading>
      <div className={styles.hero}>
        <div className={styles.heroLabel}>설정 금액</div>
        <div className={styles.heroValue}>{fmtKRW(seed)}</div>
      </div>
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
      <div className={styles.rangeLabels}>
        <span>0원</span>
        <span>2억원</span>
      </div>
      <div className={styles.presets}>
        {PRESETS.map((p) => (
          <button key={p} onClick={() => setSeed(p)} className={cx(styles.preset, seed === p && styles.presetOn)}>
            {p === 0 ? "0원" : fmtShort(p)}
          </button>
        ))}
      </div>
    </Pad>
  );
}
