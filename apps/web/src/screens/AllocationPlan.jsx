import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, CalendarRange, CalendarCheck, Flame, Coins } from "lucide-react";
import { buildAccountRooms, recommendedProducts, findProduct } from "@devidend/core";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./AllocationPlan.module.css";

const ACCT_LABELS = { isa: "ISA", pensionSavings: "연금저축", irp: "IRP", general: "일반" };
const STEP = 10_000;
const snap = (v) => Math.round(v / STEP) * STEP;

/* 매수 리듬 — 게이미피케이션의 핵심 선택지 (일/주/월) */
const CYCLES = [
  { id: "daily", label: "매일", tagline: "습관처럼 매일 조금씩", perYear: 365, icon: CalendarDays },
  { id: "weekly", label: "매주", tagline: "주 1회 루틴으로", perYear: 52, icon: CalendarRange },
  { id: "monthly", label: "매월", tagline: "월급날 한 번에", perYear: 12, icon: CalendarCheck },
];

/* ⑦ 정기적 투자금 배분 방식 결정 — 상품 선택보다 '매수 리듬(일/주/월)'을 재미있게 고른다.
 *  추천 상품은 계좌별 월 투자금에 자동 배분하고, 사용자는 주기만 선택한다(게이미피케이션).
 *  결과(productAlloc)는 기존 종목 화면과 동일한 형식이라 확인 시트·주문에 그대로 이어진다. */
export function AllocationPlan({ manualAccounts, income, monthlyContribution = 0, years = 20, initialAlloc, onNext }) {
  const { rooms } = useMemo(
    () => buildAccountRooms({ mydata: true, manual: manualAccounts, income, monthlyContribution }),
    [manualAccounts, income, monthlyContribution]
  );

  // 추천 상품 자동 배분 — 계좌별 월 투자금을 그 계좌의 대표 추천 상품에 전액 배정
  const alloc = useMemo(() => {
    if (initialAlloc && Object.keys(initialAlloc).length) return initialAlloc;
    const out = {};
    rooms
      .filter((r) => (r.planMonthly || 0) > 0)
      .forEach((r) => {
        const top = recommendedProducts(r.id)[0];
        if (top) out[r.id] = { [top.code]: snap(r.planMonthly) };
      });
    return out;
  }, [rooms, initialAlloc]);

  const lines = useMemo(
    () =>
      Object.entries(alloc)
        .flatMap(([acct, m]) =>
          Object.entries(m || {})
            .filter(([, amt]) => amt > 0)
            .map(([code, amt]) => ({ acct, code, name: findProduct(code)?.name || code, amt }))
        ),
    [alloc]
  );
  const totalMonthly = lines.reduce((s, l) => s + l.amt, 0);

  const [cycle, setCycle] = useState("weekly");
  const active = CYCLES.find((c) => c.id === cycle) || CYCLES[1];
  const perBuy = Math.round(((totalMonthly * 12) / active.perYear) / 1000) * 1000;
  const totalBuys = Math.round(active.perYear * years);

  return (
    <Pad
      footer={
        <Button onClick={() => onNext?.(alloc, cycle)} icon={ArrowRight} disabled={totalMonthly <= 0}>
          이 방식으로 최종 점검하기
        </Button>
      }
    >
      <Heading sub="추천 상품에는 자동으로 배분했어요. 꾸준히 모을 나만의 매수 리듬만 골라주세요.">
        정기 투자 리듬 정하기
      </Heading>

      {/* 매수 리듬 카드 — 게이미피케이션 핵심 선택 */}
      <div className={styles.cycleGrid} role="group" aria-label="매수 리듬">
        {CYCLES.map((c) => {
          const Icon = c.icon;
          const on = cycle === c.id;
          const buy = Math.round(((totalMonthly * 12) / c.perYear) / 1000) * 1000;
          return (
            <button
              key={c.id}
              type="button"
              className={cx(styles.cycleCard, on && styles.cycleOn)}
              onClick={() => setCycle(c.id)}
              aria-pressed={on}
            >
              <span className={styles.cycleIcon}>
                <Icon size={22} strokeWidth={2.2} />
              </span>
              <span className={styles.cycleLabel}>{c.label}</span>
              <span className={styles.cycleTag}>{c.tagline}</span>
              <span className={styles.cycleBuy}>{fmtKRW(buy)}</span>
              <span className={styles.cycleBuyK}>회당</span>
            </button>
          );
        })}
      </div>

      {/* 선택 리듬 요약 — 습관 게이지(코인/스트릭) */}
      <div className={styles.habit}>
        <div className={styles.habitTop}>
          <span className={styles.habitBadge}>
            <Flame size={14} strokeWidth={2.6} /> {active.label} 적립 습관
          </span>
          <span className={styles.habitBuys}>
            은퇴까지 <b>{totalBuys.toLocaleString()}</b>번 매수
          </span>
        </div>
        <div className={styles.coins} aria-hidden="true">
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} className={cx(styles.coin, i < Math.min(24, Math.round((active.perYear / 365) * 24)) && styles.coinOn)}>
              <Coins size={12} />
            </span>
          ))}
        </div>
        <p className={styles.habitNote}>
          회당 <b>{fmtKRW(perBuy)}</b>씩, 매달 총 <b>{fmtKRW(totalMonthly)}</b>을 계좌별 추천 상품에 자동 매수해요.
        </p>
      </div>

      {/* 자동 배분 내역 — 계좌별 추천 상품/월 금액 (읽기 전용) */}
      <div className={styles.sectionLabel}>자동 배분 내역</div>
      <div className={styles.list}>
        {lines.length === 0 ? (
          <p className={styles.empty}>배분할 월 투자금이 없어요. 목표를 다시 설정해 주세요.</p>
        ) : (
          lines.map((l) => (
            <div key={`${l.acct}-${l.code}`} className={styles.row}>
              <span className={styles.rowAcct}>{ACCT_LABELS[l.acct] ?? l.acct}</span>
              <span className={styles.rowName}>{l.name}</span>
              <span className={styles.rowAmt}>월 {fmtKRW(l.amt)}</span>
            </div>
          ))
        )}
      </div>
    </Pad>
  );
}
