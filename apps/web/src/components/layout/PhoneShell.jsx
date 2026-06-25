import { useState, useEffect } from "react";
import { Signal, Wifi, BatteryFull } from "lucide-react";
import styles from "./PhoneShell.module.css";

/* 발표용 아이폰 베젤 셸 (?frame=1 에서만 사용).
 * 가짜 상태바(9:41)·홈바·노치 등 폰 cosmetic 을 여기서만 그린다.
 * 실서비스 코드(ChromeBody)와 완전히 분리 — 안 쓰면 영향 없음. */
export function PhoneShell({ children }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const onResize = () => setScale(Math.min(1, (window.innerWidth - 16) / 426));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const exit = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("frame");
    window.location.assign(url.pathname + url.search);
  };

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

              {children}

              <div className={styles.home}>
                <div className={styles.homeBar} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <button className={styles.exit} onClick={exit}>
        전체 화면(일반 버전)으로 보기 →
      </button>
    </div>
  );
}
