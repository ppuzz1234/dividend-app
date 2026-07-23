import { createPortal } from "react-dom";
import { Hourglass } from "lucide-react";
import styles from "./PrepModal.module.css";

/* 준비 중 모달 — 아직 구현되지 않은 상세 화면을 대신하는 안내 팝업 */
export function PrepModal({ title = "준비 중이에요", desc = "이 기능은 곧 열려요. 조금만 기다려 주세요.", onClose }) {
  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className={styles.icon}>
          <Hourglass size={22} strokeWidth={2.2} />
        </span>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.desc}>{desc}</p>
        <button type="button" className={styles.ok} onClick={onClose}>
          확인
        </button>
      </div>
    </div>,
    document.body
  );
}
