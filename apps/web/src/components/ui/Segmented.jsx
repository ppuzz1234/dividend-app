import { cx } from "../../lib/cx.js";
import styles from "./Segmented.module.css";

export function Segmented({ value, onChange, opts, small }) {
  return (
    <div className={cx(styles.seg, small && styles.segSmall)}>
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cx(styles.opt, small && styles.optSmall, value === o.v && styles.optOn)}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
