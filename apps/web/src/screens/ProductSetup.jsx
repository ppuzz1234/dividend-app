import { useMemo, useState } from "react";
import { ArrowRight, Check, Info } from "lucide-react";
import { buildAccountRooms, recommendedProducts, accountStrategy } from "@devidend/core";
import { Pad } from "../components/layout/Pad.jsx";
import { Button } from "../components/ui/Button.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./ProductSetup.module.css";

/* 계좌 별 투자 상품 설정 — 계좌 전략(AccountRooms)에서 산출한 계좌별 월 투자금 안에서
 * 추천 상품(knowledge/accountProducts.js)을 고르고, 슬라이더로 금액을 배분한다.
 * · 4계좌 탭 유지(전환 시 탭 영역이 최상단으로 끌어올라오는 등장 애니메이션).
 * · 상품 선택(체크) + 금액 슬라이더를 한 화면에 결합.
 * · 계좌 총액을 넘을 수 없음 — 각 슬라이더의 상한이 "남은 금액"까지로 clamp(여유 허용). */
const TAB_ORDER = ["isa", "pensionSavings", "irp", "general"];
const TAB_LABELS = { isa: "ISA", pensionSavings: "연금저축", irp: "IRP", general: "일반" };
const CYCLES = [
  { id: "weekly", label: "주 1회" },
  { id: "monthly", label: "월 1회" },
  { id: "yearly", label: "연 1회" },
];
const STEP = 10_000; // 1만원 단위
const snap = (v) => Math.round(v / STEP) * STEP;

export function ProductSetup({ manualAccounts, income, monthlyContribution = 0, initialAlloc, onNext }) {
  const { rooms } = useMemo(
    () => buildAccountRooms({ mydata: true, manual: manualAccounts, income, monthlyContribution }),
    [manualAccounts, income, monthlyContribution]
  );
  // 예산은 슬라이더 단위(STEP)로 반올림 — 딱 떨어지지 않는 planMonthly 의 자투리(만원 미만)로
  // 끝까지 담아도 남은 배분이 남는 문제를 없앤다(표시값과도 일치).
  const budgetOf = (id) => snap(rooms.find((r) => r.id === id)?.planMonthly || 0);

  const [tab, setTab] = useState(TAB_ORDER.find((id) => budgetOf(id) > 0) || TAB_ORDER[0]);
  const [alloc, setAlloc] = useState(() => initialAlloc || {}); // alloc[accountId][code] = 금액(원)
  const [cycles, setCycles] = useState({}); // cycles[accountId] = 'weekly'|'monthly'|'yearly'

  const budget = budgetOf(tab);
  const acct = alloc[tab] || {};
  const used = Object.values(acct).reduce((s, v) => s + v, 0);
  const remaining = Math.max(0, budget - used);
  const products = recommendedProducts(tab);
  const strat = accountStrategy(tab);
  const cycle = cycles[tab] || "monthly";

  const setAmount = (code, v) => setAlloc((a) => ({ ...a, [tab]: { ...(a[tab] || {}), [code]: v } }));
  const toggle = (code) => {
    if (budget <= 0) return;
    if (acct[code] != null) {
      const next = { ...acct };
      delete next[code];
      setAlloc((a) => ({ ...a, [tab]: next }));
    } else {
      setAmount(code, 0); // 선택만 하고 금액은 0 — 슬라이더로 남은 한도 안에서 나눠 담는다
    }
  };
  // 이 상품이 커질 수 있는 상한 = 총액 − (다른 상품 합) → 총액 초과 방지(공유)
  const maxFor = (code) => budget - (used - (acct[code] || 0));
  const onSlide = (code, v) => setAmount(code, Math.min(snap(v), maxFor(code)));

  const selectedCount = Object.values(alloc).reduce((s, m) => s + Object.keys(m || {}).length, 0);

  return (
    <Pad
      footer={
        <Button onClick={() => onNext?.(alloc)} icon={ArrowRight}>
          {selectedCount ? `${selectedCount}개 상품으로 시뮬레이션` : "이 구성으로 시뮬레이션"}
        </Button>
      }
    >
      <div className={styles.riseWrap}>
        {/* ── 상단 틀고정 — 탭 + 계좌 헤더(예산·남은 배분)까지 화면에 고정 ── */}
        <div className={styles.frozen}>
          <div className={styles.tabs} role="tablist" aria-label="계좌별 상품 설정">
            {TAB_ORDER.map((id) => {
              const b = budgetOf(id);
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={cx(styles.tab, tab === id && styles.tabOn)}
                  onClick={() => setTab(id)}
                >
                  {TAB_LABELS[id]}
                  {b > 0 && <span className={styles.tabAmt}>{fmtKRW(b)}</span>}
                </button>
              );
            })}
          </div>

          <div
            key={tab}
            className={cx(
              styles.headCard,
              tab === TAB_ORDER[0] && styles.headFirst,
              tab === TAB_ORDER[TAB_ORDER.length - 1] && styles.headLast
            )}
          >
            <div className={styles.head}>
              <div className={styles.headTop}>
                <span className={styles.acctName}>{TAB_LABELS[tab]}계좌</span>
                <span className={styles.budget}>
                  월 <b>{fmtKRW(budget)}</b>
                </span>
              </div>
              {strat?.headline && <p className={styles.headline}>{strat.headline}</p>}
              {strat?.note && (
                <p className={styles.note}>
                  <Info size={13} strokeWidth={2.4} /> {strat.note}
                </p>
              )}
            </div>

            {budget > 0 && (
              <>
                <div className={styles.remainRow}>
                  <span className={styles.remainK}>남은 배분</span>
                  <span className={cx(styles.remainV, remaining === 0 && styles.remainDone)}>{fmtKRW(remaining)}</span>
                </div>
                <div className={styles.gauge}>
                  <div className={styles.gaugeFill} style={{ width: `${budget ? (used / budget) * 100 : 0}%` }} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── 스크롤 영역 — 매수 주기 + 상품 리스트 ── */}
        {budget <= 0 ? (
          <p className={styles.empty}>이번 배분에서 이 계좌에 투자할 금액이 없어요. 다른 계좌를 설정해 주세요.</p>
        ) : (
          <div key={tab} className={styles.scrollArea}>
            {/* 매수 주기 */}
            <div className={styles.cycleRow} role="group" aria-label="매수 주기">
              {CYCLES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={cx(styles.cycleBtn, cycle === c.id && styles.cycleOn)}
                  onClick={() => setCycles((cs) => ({ ...cs, [tab]: c.id }))}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* 상품 리스트 — 선택(체크) + 금액 슬라이더 결합 */}
            <div className={styles.list}>
                {products.map((p) => {
                  const sel = acct[p.code] != null;
                  const amt = acct[p.code] || 0;
                  return (
                    <div key={p.code} className={cx(styles.card, sel && styles.cardOn)}>
                      <button type="button" className={styles.cardHead} onClick={() => toggle(p.code)}>
                        <span className={styles.pinfo}>
                          <span className={styles.pname}>
                            {p.name}
                            {p.yield != null && <span className={styles.pyield}>배당 {(p.yield * 100).toFixed(1)}%</span>}
                          </span>
                          <span className={styles.pdesc}>{p.desc}</span>
                        </span>
                        <span className={cx(styles.check, sel && styles.checkOn)}>
                          {sel && <Check size={14} strokeWidth={3} />}
                        </span>
                      </button>

                      {sel && (
                        <div className={styles.sliderRow}>
                          <div className={styles.sliderTop}>
                            <span className={styles.sliderCap}>월 배분액</span>
                            <b className={styles.sliderVal}>{fmtKRW(amt)}</b>
                          </div>
                          {/* max 는 계좌 총액으로 고정 — 다른 슬라이더의 썸이 딸려 움직이지 않게.
                             총액 초과 방지(clamp)는 onSlide 에서만 처리한다 */}
                          <input
                            type="range"
                            className="rng"
                            min={0}
                            max={budget}
                            step={STEP}
                            value={amt}
                            aria-label={`${p.name} 월 배분액`}
                            onChange={(e) => onSlide(p.code, Number(e.target.value))}
                            style={{ width: "100%" }}
                          />
                          <div className={styles.sliderScale}>
                            <span>0</span>
                            <span>{fmtKRW(budget)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </Pad>
  );
}
