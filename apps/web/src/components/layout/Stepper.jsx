import { cx } from "../../lib/cx.js";
import { STAGE_LABELS } from "../../lib/flow.js";
import styles from "./Stepper.module.css";

export function Stepper({ stage }) {
  return (
    <div className={styles.stepper}>
      {STAGE_LABELS.map((l, i) => (
        <div key={l} className={styles.item}>
          <div className={cx(styles.bar, i <= stage && styles.barOn, i === stage && styles.barCurrent)} />
          <span className={cx(styles.lbl, i <= stage && styles.lblOn)}>{l}</span>
        </div>
      ))}
    </div>
  );
}
