import { useState, useEffect } from "react";

/* 0 → target 까지 ease-out 카운트업 애니메이션 */
export function useCountUp(target, dur = 1000) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf,
      start;
    const tick = (t) => {
      if (!start) start = t;
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setV(target * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}
