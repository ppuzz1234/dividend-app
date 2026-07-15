import styles from "./RollingNumber.module.css";

const REEL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/* 슬롯머신(오도미터) 숫자 롤링.
 * value(문자열, 예: "1억 2,000만원")를 문자 단위로 렌더하되, 숫자는 세로 릴(0~9)을
 * translateY 로 굴려 정착시킨다. 값이 바뀌면 CSS transition 이 자동으로 애니메이션.
 * 쉼표·공백·단위(억/만원) 등 비숫자 문자는 고정 렌더. 좌→우 stagger 로 릴이 순차 정착. */
export function RollingNumber({ value, className }) {
  const chars = String(value).split("");
  return (
    <span className={`${styles.root} ${className || ""}`}>
      {chars.map((ch, i) => {
        if (ch >= "0" && ch <= "9") {
          const d = Number(ch);
          return (
            <span key={i} className={styles.reel} aria-hidden="true">
              <span
                className={styles.strip}
                style={{ transform: `translateY(${-d * 10}%)`, transitionDelay: `${i * 45}ms` }}
              >
                {REEL.map((n) => (
                  <span key={n} className={styles.cell}>
                    {n}
                  </span>
                ))}
              </span>
            </span>
          );
        }
        return (
          <span key={i} className={styles.reel} aria-hidden="true">
            <span className={styles.cell}>{ch === " " ? " " : ch}</span>
          </span>
        );
      })}
      {/* 스크린리더/접근성용 실제 값 */}
      <span className={styles.sr}>{value}</span>
    </span>
  );
}
