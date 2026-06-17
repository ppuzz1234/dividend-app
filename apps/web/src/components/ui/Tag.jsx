import { cx } from "../../lib/cx.js";
import styles from "./Tag.module.css";

export function Tag({ children, tone = "jade" }) {
  return <span className={cx(styles.tag, styles[tone])}>{children}</span>;
}
