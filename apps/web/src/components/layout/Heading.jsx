import styles from "./Heading.module.css";

export function Heading({ children, sub }) {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{children}</h1>
      {sub && <p className={styles.sub}>{sub}</p>}
    </div>
  );
}
