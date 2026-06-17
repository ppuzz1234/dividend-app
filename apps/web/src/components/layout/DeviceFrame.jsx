import { useState, useEffect } from "react";
import { ChevronLeft, Signal, Wifi, BatteryFull } from "lucide-react";
import { Stepper } from "./Stepper.jsx";
import styles from "./DeviceFrame.module.css";

/* iPhone 형태의 기기 프레임. 화면 폭에 맞춰 스케일 조정.
 * stage 가 숫자면 헤더(뒤로가기 + 스텝퍼)를 표시하고, null 이면 숨김. */
export function DeviceFrame({ stage = null, onBack, contentKey, children }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const onResize = () => setScale(Math.min(1, (window.innerWidth - 16) / 426));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const showHeader = stage !== null;

  return (
    <div className={styles.wrap}>
      <div className={styles.scaler} style={{ "--scale": scale }}>
        <div className={styles.scaled}>
          <div className={styles.frame}>
            <div className={styles.screen}>
              <div className={styles.island} />

              <div className={styles.statusbar}>
                <span className={styles.time}>9:41</span>
                <div className={styles.statusIcons}>
                  <Signal size={15} strokeWidth={2.5} />
                  <Wifi size={15} strokeWidth={2.5} />
                  <BatteryFull size={20} strokeWidth={2} />
                </div>
              </div>

              {showHeader && (
                <div className={styles.header}>
                  <div className={styles.headerRow}>
                    <button onClick={onBack} aria-label="뒤로" className={styles.backBtn}>
                      <ChevronLeft size={20} />
                    </button>
                    <Stepper stage={stage} />
                  </div>
                </div>
              )}

              <div id="scrollArea" className={`${styles.scroll} noscroll`}>
                <div key={contentKey} className={`${styles.content} fadeUp`}>
                  {children}
                </div>
              </div>

              <div className={styles.home}>
                <div className={styles.homeBar} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
