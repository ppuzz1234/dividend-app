import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, Check } from "lucide-react";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./PlanHistory.module.css";

const fmtDate = (iso) =>
  new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/* 납입 계획 변경 이력 — append-only 리비전 목록.
 * 되돌리기를 눌러도 과거 기록은 지워지지 않는다(선택한 리비전이 새 리비전으로 복제됨).
 * 모달은 포털로 body 에 렌더 — 애니메이션이 걸린 조상 안에서도 화면 전체를 덮는다. */
export function PlanHistory({ revisions = [], busy, onRestore, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const current = revisions[0]; // 최신 = 현재 적용본

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="납입 계획 변경 이력"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div>
            <div className={styles.title}>변경 이력</div>
            <p className={styles.sub}>지난 계획을 그대로 되돌릴 수 있어요. 되돌려도 기록은 남습니다.</p>
          </div>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {revisions.length === 0 ? (
          <p className={styles.empty}>아직 저장된 계획이 없어요.</p>
        ) : (
          <ol className={styles.list}>
            {revisions.map((r) => {
              const isCurrent = r.id === current?.id;
              return (
                <li key={r.id} className={cx(styles.row, isCurrent && styles.rowOn)}>
                  <div className={styles.rowTop}>
                    <span className={styles.no}>#{r.revision_no}</span>
                    {isCurrent && (
                      <span className={styles.badge}>
                        <Check size={11} strokeWidth={3} /> 현재
                      </span>
                    )}
                    {r.restored_from && <span className={styles.restored}>복구본</span>}
                    <span className={styles.date}>{fmtDate(r.created_at)}</span>
                  </div>
                  <div className={styles.figures}>
                    <span>
                      목표 <b>월 {r.monthly_goal_manwon.toLocaleString()}만원</b>
                    </span>
                    <span>
                      투자 <b>월 {fmtKRW(r.monthly_contribution)}</b>
                    </span>
                  </div>
                  {r.note && <p className={styles.note}>{r.note}</p>}
                  {!isCurrent && (
                    <button
                      type="button"
                      className={styles.restoreBtn}
                      disabled={busy}
                      onClick={() => onRestore?.(r.id)}
                    >
                      <RotateCcw size={13} strokeWidth={2.6} />
                      이 계획으로 되돌리기
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>,
    document.body
  );
}
