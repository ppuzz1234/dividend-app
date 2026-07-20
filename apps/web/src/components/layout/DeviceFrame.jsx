import { useEffect, useRef } from "react";
import styles from "./DeviceFrame.module.css";

/* iPhone 17 Pro 디바이스 시뮬레이터 (경로: /device)
 * 실서비스 앱(index, src="/")을 iframe 으로 임베드하고 창 크기에 맞춰 스케일한다.
 * hpr 프로젝트의 DeviceFrame 구조를 devidend(제이드/골드) 테마로 이식. */
export function DeviceFrame() {
  const stageRef = useRef(null);

  useEffect(() => {
    // 실제 폰(터치 + 좁은 화면)에서 열리면 프레임 없이 앱으로 이동.
    // 데스크톱 좁은 창에서는 프레임을 계속 보여준다.
    const isRealPhone =
      window.matchMedia("(pointer: coarse)").matches && window.innerWidth <= 520;
    if (isRealPhone) {
      window.location.replace("/");
      return;
    }
    const fit = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const dev = stage.firstElementChild;
      const w = dev.offsetWidth,
        h = dev.offsetHeight;
      let s = Math.min(1, (window.innerHeight - 130) / h, (window.innerWidth - 40) / w);
      if (s <= 0) s = 1;
      dev.style.transform = "scale(" + s + ")";
      stage.style.width = w * s + "px";
      stage.style.height = h * s + "px";
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className={styles.sim}>
      <div className={styles.stage} ref={stageRef}>
        <div className={styles.device}>
          <div className={styles.screen}>
            <div className={styles.island} />
            <iframe className={styles.frameEmbed} src="/?device=1" title="PLUS CUBE" />
          </div>
          <span className={`${styles.btn} ${styles.bAction}`} />
          <span className={`${styles.btn} ${styles.bVolup}`} />
          <span className={`${styles.btn} ${styles.bVoldn}`} />
          <span className={`${styles.btn} ${styles.bPower}`} />
          <span className={`${styles.btn} ${styles.bCam}`} />
        </div>
      </div>
      <div className={styles.caption}>
        <div className={styles.captionText}>
          <b>iPhone 17 Pro</b> · PLUS CUBE Simulator
        </div>
        <a href="/">전체 화면(브라우저)으로 열기 →</a>
      </div>
    </div>
  );
}
