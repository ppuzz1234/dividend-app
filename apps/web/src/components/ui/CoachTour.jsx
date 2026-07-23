import { useLayoutEffect, useState } from "react";
import { cx } from "../../lib/cx.js";
import styles from "./CoachTour.module.css";

/* 스포트라이트 코치마크 투어 — 나머지 영역을 dim 처리하고, 대상 영역만 하이라이트하며
 * 툴팁 설명을 순서대로 노출한다. 화면 어디를 눌러도(또는 '다음') 다음 단계로 넘어간다.
 * steps: [{ ref, text, scroll?, pad? }] — ref 는 하이라이트할 요소의 React ref.
 * steps 는 부모에서 useMemo 로 안정화해 넘겨야 한다(측정 이펙트 무한 루프 방지). */
export function CoachTour({ steps, onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[i];

  useLayoutEffect(() => {
    const el = steps[i]?.ref?.current;
    if (!el) return undefined;
    if (steps[i].scroll !== false) el.scrollIntoView({ block: "center", behavior: "auto" });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    const raf = requestAnimationFrame(measure);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [i, steps]);

  if (!step || !rect) return null;

  const last = i === steps.length - 1;
  const advance = () => (last ? onClose?.() : setI((n) => n + 1));

  const pad = step.pad ?? 8;
  const box = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  // 대상이 화면 상단 절반이면 아래에, 하단 절반이면 위에 툴팁을 붙인다
  const below = rect.top + rect.height / 2 < window.innerHeight / 2;
  const tipStyle = below
    ? { top: box.top + box.height + 12, left: box.left, width: box.width }
    : { bottom: window.innerHeight - box.top + 12, left: box.left, width: box.width };

  return (
    <div className={styles.overlay} onClick={advance} role="dialog" aria-modal="true">
      <div
        className={styles.spot}
        style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
      />
      <div className={styles.tip} style={tipStyle} onClick={(e) => e.stopPropagation()}>
        <p className={styles.tipText}>{step.text}</p>
        <div className={styles.tipFoot}>
          <span className={styles.tipDots} aria-hidden="true">
            {steps.map((_, n) => (
              <i key={n} className={cx(styles.tdot, n === i && styles.tdotOn)} />
            ))}
          </span>
          <button type="button" className={styles.tipBtn} onClick={advance}>
            {last ? "시작하기" : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}
