import { cx } from "../../lib/cx.js";
import styles from "./Switch.module.css";

export function Switch({ on }) {
  return (
    <span className={cx(styles.track, on && styles.on)}>
      <span className={styles.knob} />
    </span>
  );
}
