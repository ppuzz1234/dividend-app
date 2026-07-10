import { ACCOUNTS } from "../knowledge/accounts.js";

/* ------------------------------------------------------------------ *
 *  ⑦ 매수 프로세스 — 배분안 × 선택 종목 → 주문 계획
 *  core 는 "무엇을 얼마나 살지"까지만 만든다.
 *  실제 인증·잔고확인·체결은 apps/api/src/orders (KIS) 담당.
 * ------------------------------------------------------------------ */

const floorTo = (v, unit) => Math.floor(v / unit) * unit;

/**
 * @param {object} p
 *  - plan: allocate() 결과의 plan [{accountId, seed, monthly}]
 *  - stocks: 선택 종목 배열 (STOCKS 원소)
 * @returns {{ byAccount, totalSeed, totalMonthly, orderCount }}
 */
export function buildOrderPlan({ plan = [], stocks = [] } = {}) {
  const active = plan.filter((p) => p.seed > 0 || p.monthly > 0);
  const n = stocks.length || 1;

  const byAccount = active.map((p) => {
    const acc = ACCOUNTS.find((a) => a.id === p.accountId) || ACCOUNTS[0];
    // 1차 버전: 계좌 배분액을 선택 종목에 균등 분할 (1,000원 단위 절사)
    const orders = stocks.map((s) => ({
      stock: s,
      amount: floorTo(p.seed / n, 1_000),
      monthlyAmount: floorTo(p.monthly / n, 1_000),
    }));
    return { accountId: p.accountId, account: acc, seed: p.seed, monthly: p.monthly, orders };
  });

  return {
    byAccount,
    totalSeed: active.reduce((s, p) => s + p.seed, 0),
    totalMonthly: active.reduce((s, p) => s + p.monthly, 0),
    orderCount: byAccount.reduce((s, a) => s + a.orders.length, 0),
  };
}
