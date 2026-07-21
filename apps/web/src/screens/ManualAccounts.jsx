import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import { Button } from "../components/ui/Button.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./ManualAccounts.module.css";

/* 계좌별 슬라이더 범위 — 0(계좌 없음)부터 연 납입한도까지 50만원 단위.
 * 일반계좌는 한도가 없어 1억까지 잡는다(그 이상은 전략상 의미가 크지 않음). */
const STEP = 500_000;
const ACCOUNTS = [
  { id: "isa", name: "ISA", max: 20_000_000, hint: "연 2,000만원까지 납입할 수 있어요" },
  { id: "pensionSavings", name: "연금저축", max: 18_000_000, hint: "세액공제는 600만원까지, 납입은 1,800만원까지" },
  { id: "irp", name: "IRP", max: 18_000_000, hint: "연금저축과 합산해 연 1,800만원까지" },
  { id: "general", name: "일반 위탁계좌", max: 100_000_000, hint: "한도·상품 제약이 없는 기본 계좌" },
];

/* 마이데이터 대신 계좌 현황을 직접 입력받는 바텀시트.
 * 화면 전환이 아니라 현재 화면(온보딩 요약) 위로 슬라이드업 되는 시트로 표현한다.
 * 포털로 body 에 렌더 — 애니메이션이 걸린 조상 안에서도 화면 전체를 덮는다.
 * 4개 계좌를 세로 슬라이더로 나열하고, 0은 "계좌 없음"으로 처리한다.
 * 여기서 모은 값(올해 납입액 = 현재 평가액 가정)이 마이데이터 연동으로 얻던
 * 정보를 대신해 전략 화면의 여력·필요자산 계산에 그대로 쓰인다. */
export function ManualAccounts({ onNext, onClose }) {
  const [values, setValues] = useState({ isa: 0, pensionSavings: 0, irp: 0, general: 0 });
  const set = (id, v) => setValues((s) => ({ ...s, [id]: v }));
  const total = Object.values(values).reduce((s, v) => s + v, 0);
  const owned = ACCOUNTS.filter((a) => values[a.id] > 0);

  // Esc 로 닫기 + 열려 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="계좌 현황 입력"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.grabber} aria-hidden="true" />

        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>
              지금 가지고 있는 계좌를
              <br />
              알려주세요
            </h2>
            <p className={styles.sub}>
              올해 납입한 금액을 옮겨서 맞춰주세요. 없는 계좌는 맨 왼쪽(계좌 없음)에 두면 돼요.
            </p>
          </div>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={`${styles.scrollBody} noscroll`}>
          <div className={styles.list}>
            {ACCOUNTS.map((a) => {
              const v = values[a.id];
              const none = v === 0;
              return (
                <div key={a.id} className={cx(styles.card, !none && styles.cardOn)}>
                  <div className={styles.top}>
                    <span className={styles.name}>{a.name}</span>
                    <span className={cx(styles.value, none && styles.valueNone)}>
                      {none ? "계좌 없음" : fmtKRW(v)}
                    </span>
                  </div>

                  <input
                    type="range"
                    className="rng"
                    min={0}
                    max={a.max}
                    step={STEP}
                    value={v}
                    aria-label={`${a.name} 올해 납입액`}
                    onChange={(e) => set(a.id, Number(e.target.value))}
                    style={{ width: "100%" }}
                  />

                  <div className={styles.scale}>
                    <span>계좌 없음</span>
                    <span className={styles.hint}>{a.hint}</span>
                    <span>{fmtKRW(a.max)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 입력 요약 — 다음 화면의 "내 자산" 타일로 이어진다 */}
          <div className={styles.summary}>
            <span className={styles.sumK}>{owned.length ? `보유 계좌 ${owned.length}개` : "보유 계좌 없음"}</span>
            <b className={styles.sumV}>{fmtKRW(total)}</b>
          </div>
        </div>

        <div className={styles.footer}>
          <Button onClick={() => onNext?.(values)} icon={ArrowRight}>
            {owned.length ? "이 정보로 전략 만들기" : "계좌 없이 시작하기"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
