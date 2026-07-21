import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, X } from "lucide-react";
import { findProduct } from "@devidend/core";
import { Button } from "../components/ui/Button.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./OrderConfirmSheet.module.css";

const ACCOUNT_LABELS = { isa: "ISA", pensionSavings: "연금저축", irp: "IRP", general: "일반" };
const ORDER = ["isa", "pensionSavings", "irp", "general"];

/* 배분·투자 확인 바텀시트 — 계좌별로 어떤 상품을 얼마씩 매수하는지 종합 표를 보여주고,
 * 하단의 두 필수 확인(투자설명서·원금손실 위험)을 모두 체크해야 "최종 진행하기"가 활성화된다. */
export function OrderConfirmSheet({ alloc = {}, onConfirm, onClose }) {
  const [agree, setAgree] = useState({ prospectus: false, risk: false });
  const allChecked = agree.prospectus && agree.risk;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // 계좌별 매수 내역 — 금액 0 초과 상품만
  const accounts = ORDER
    .map((id) => ({
      id,
      name: ACCOUNT_LABELS[id],
      items: Object.entries(alloc[id] || {})
        .filter(([, amt]) => amt > 0)
        .map(([code, amt]) => ({ code, name: findProduct(code)?.name || code, amt })),
    }))
    .filter((a) => a.items.length > 0)
    .map((a) => ({ ...a, subtotal: a.items.reduce((s, i) => s + i.amt, 0) }));
  const grandTotal = accounts.reduce((s, a) => s + a.subtotal, 0);

  const toggle = (k) => setAgree((s) => ({ ...s, [k]: !s[k] }));

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="배분·투자 확인" onClick={(e) => e.stopPropagation()}>
        <span className={styles.grabber} aria-hidden="true" />

        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>배분 · 투자 확인</h2>
            <p className={styles.sub}>매달 어떤 계좌에 어떤 상품을 얼마씩 매수할지 확인하세요.</p>
          </div>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.scrollBody}>
          {/* 계좌별 매수 종합 표 */}
          <div className={styles.table}>
            {accounts.length === 0 ? (
              <p className={styles.empty}>매수할 상품이 없어요. 계좌 별 투자 상품 설정에서 상품을 담아 주세요.</p>
            ) : (
              accounts.map((a) => (
                <div key={a.id} className={styles.acct}>
                  <div className={styles.acctHead}>
                    <span className={styles.acctName}>{a.name}계좌</span>
                    <span className={styles.acctSum}>월 {fmtKRW(a.subtotal)}</span>
                  </div>
                  {a.items.map((it) => (
                    <div key={it.code} className={styles.item}>
                      <span className={styles.itemName}>{it.name}</span>
                      <span className={styles.itemAmt}>월 {fmtKRW(it.amt)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* 총 매수금 */}
          {grandTotal > 0 && (
            <div className={styles.total}>
              <span className={styles.totalK}>매달 총 매수금</span>
              <b className={styles.totalV}>{fmtKRW(grandTotal)}</b>
            </div>
          )}

          {/* 필수 확인 영역 */}
          <div className={styles.agreeWrap}>
            <div className={styles.agreeTitle}>주의사항 확인</div>
            {[
              { k: "prospectus", label: "투자설명서 교부 및 확인 (필수)" },
              { k: "risk", label: "원금 손실 위험 고지 확인 (필수)" },
            ].map(({ k, label }) => (
              <button key={k} type="button" className={styles.agreeRow} onClick={() => toggle(k)} aria-pressed={agree[k]}>
                <span className={cx(styles.check, agree[k] && styles.checkOn)}>
                  {agree[k] && <Check size={14} strokeWidth={3} />}
                </span>
                <span className={styles.agreeLabel}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          <Button onClick={() => allChecked && onConfirm?.()} variant="gold" icon={ArrowRight} disabled={!allChecked || grandTotal === 0}>
            최종 진행하기
          </Button>
          {!allChecked && <p className={styles.footNote}>필수 확인 항목을 모두 체크해 주세요.</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}
