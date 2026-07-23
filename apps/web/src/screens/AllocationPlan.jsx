import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { buildAccountRooms, recommendedProducts, findProduct } from "@devidend/core";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { EtfBrandTile } from "../components/ui/EtfBrandTile.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./AllocationPlan.module.css";

const ACCT_LABELS = { isa: "ISA", pensionSavings: "연금저축", irp: "IRP", general: "일반" };
const STEP = 10_000;
const snap = (v) => Math.round(v / STEP) * STEP;

/* 매수 리듬 — 일/주/월. 주기별 매수일: 매일=영업일 개념 없이 매일, 매주=월요일, 매월=1일 */
const CYCLES = [
  { id: "daily", label: "매일", tagline: "습관처럼 매일 조금씩", perYear: 365 },
  { id: "weekly", label: "매주", tagline: "매주 월요일, 주 1회 루틴", perYear: 52 },
  { id: "monthly", label: "매월", tagline: "매달 1일, 월급날 한 번에", perYear: 12 },
];

/* 이번 달 실제 달력 기준 매수일 계산 — 리듬 선택이 곧 일정으로 보이게 한다 */
function buyDaysOfMonth(cycleId) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const dim = new Date(y, m + 1, 0).getDate();
  const days = [];
  for (let d = 1; d <= dim; d++) {
    const wd = new Date(y, m, d).getDay();
    if (cycleId === "daily" || (cycleId === "weekly" && wd === 1) || (cycleId === "monthly" && d === 1)) {
      days.push(d);
    }
  }
  return { month: m + 1, dim, days };
}

/* ⑦ 정기적 투자금 배분 방식 결정 — 상품 선택보다 '매수 리듬(일/주/월)'을 고른다.
 *  추천 상품은 계좌별 월 투자금에 자동 배분하고, 사용자는 주기만 선택한다.
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
  const { month, dim, days } = useMemo(() => buyDaysOfMonth(cycle), [cycle]);
  const buySet = useMemo(() => new Set(days), [days]);

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

      {/* 매수 리듬 선택 — 타이포 중심 세그먼트 카드 (선택 상태만 강조색) */}
      <div className={styles.cycleGrid} role="group" aria-label="매수 리듬">
        {CYCLES.map((c) => {
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
              <span className={styles.cycleLabel}>{c.label}</span>
              <b className={styles.cycleBuy}>{fmtKRW(buy)}</b>
              <span className={styles.cycleBuyK}>회당</span>
            </button>
          );
        })}
      </div>

      {/* 이번 달 매수 일정 — 실제 달력 기준. 리듬을 바꾸면 매수일 마커가 바뀐다 */}
      <div className={styles.plan}>
        <div className={styles.planHead}>
          <b className={styles.planTitle}>{month}월 매수 일정</b>
          <span className={styles.planTag}>{active.tagline}</span>
        </div>

        <div className={styles.strip} aria-hidden="true">
          {Array.from({ length: dim }, (_, i) => (
            <i key={i} className={cx(styles.tick, buySet.has(i + 1) && styles.tickOn)} />
          ))}
        </div>
        <div className={styles.axis} aria-hidden="true">
          <span>1일</span>
          <span>{dim}일</span>
        </div>

        <p className={styles.planNote}>
          이번 달 <b>{days.length}번</b>, 회당 <b>{fmtKRW(perBuy)}</b>씩 자동 매수해요.
        </p>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statK}>매달 총액</span>
            <b className={styles.statV}>{fmtKRW(totalMonthly)}</b>
          </div>
          <div className={styles.stat}>
            <span className={styles.statK}>은퇴까지</span>
            <b className={styles.statV}>{totalBuys.toLocaleString()}번 매수</b>
          </div>
        </div>
      </div>

      {/* 자동 배분 내역 — 계좌별 추천 상품/월 금액 (읽기 전용) */}
      <div className={styles.sectionLabel}>자동 배분 내역</div>
      <div className={styles.list}>
        {lines.length === 0 ? (
          <p className={styles.empty}>배분할 월 투자금이 없어요. 목표를 다시 설정해 주세요.</p>
        ) : (
          lines.map((l) => (
            <div key={`${l.acct}-${l.code}`} className={styles.row}>
              <EtfBrandTile name={l.name} size={32} />
              <span className={styles.rowInfo}>
                <span className={styles.rowName}>{l.name}</span>
                <span className={styles.rowAcct}>{ACCT_LABELS[l.acct] ?? l.acct}계좌</span>
              </span>
              <span className={styles.rowAmt}>월 {fmtKRW(l.amt)}</span>
            </div>
          ))
        )}
      </div>
    </Pad>
  );
}
