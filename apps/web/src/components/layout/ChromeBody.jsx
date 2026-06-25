import { ChevronLeft } from "lucide-react";
import { Stepper } from "./Stepper.jsx";
import styles from "./ChromeBody.module.css";

/* 앱 본체(실서비스) — 헤더(뒤로가기·스텝퍼) + 스크롤 + 콘텐츠.
 * 베젤/상태바 같은 폰 cosmetic 은 포함하지 않는다(발표용 PhoneShell 담당).
 * stage 가 숫자면 헤더 표시, null 이면 숨김. */
export function ChromeBody({ stage = null, onBack, contentKey, children }) {
  const showHeader = stage !== null;
  return (
    <div className={styles.shell}>
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
    </div>
  );
}
