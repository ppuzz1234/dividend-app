import { cx } from "../../lib/cx.js";
import styles from "./Button.module.css";

export function Button({ children, onClick, disabled, variant = "primary", icon: Icon }) {
  return (
    <button className={cx(styles.btn, styles[variant])} onClick={onClick} disabled={disabled}>
      {children}
      {Icon && <Icon size={19} strokeWidth={2.4} />}
    </button>
  );
}
