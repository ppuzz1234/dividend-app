import { cx } from "../../lib/cx.js";
import styles from "./Label.module.css";

export function Label({ children, top }) {
  return <div className={cx(styles.label, top && styles.top)}>{children}</div>;
}
