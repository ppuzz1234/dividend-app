import { STOCKS } from "../data/stocks.js";
import { ACCOUNTS } from "../data/accounts.js";
import { avg } from "./format.js";

/* ------------------------------------------------------------------ *
 *  배당 눈덩이 시뮬레이션
 *  · 단일 통화(원) 정규화, 표기 수익률은 예시 가정치
 *  · 투자 권유가 아니며 실제 수익을 보장하지 않음
 * ------------------------------------------------------------------ */
export function simulate({ seed, monthly, years, holdings, reinvest, account }) {
  const list = holdings.length ? holdings : STOCKS.filter((s) => s.elite);
  const y0 = avg(list.map((s) => s.yield));
  const g = avg(list.map((s) => s.divG));
  const p = avg(list.map((s) => s.priceG));
  const acc = ACCOUNTS.find((a) => a.id === account) || ACCOUNTS[0];
  const tax = acc.tax;
  const n = years * 12;
  const rp = Math.pow(1 + p, 1 / 12) - 1;

  let value = seed,
    contributed = seed,
    cumDiv = 0;
  const series = [{ year: 0, value: seed, principal: seed, gain: 0, income: seed * y0 }];

  for (let m = 1; m <= n; m++) {
    value *= 1 + rp;
    const yNow = y0 * Math.pow((1 + g) / (1 + p), m / 12);
    let div = value * (yNow / 12) * (1 - tax);
    cumDiv += div;
    if (reinvest) value += div;
    value += monthly;
    contributed += monthly;
    if (m % 12 === 0)
      series.push({
        year: m / 12,
        value,
        principal: contributed,
        gain: Math.max(0, value - contributed),
        income: value * yNow * (1 - tax),
      });
  }
  const last = series[series.length - 1];
  return {
    series,
    finalValue: value,
    contributed,
    gain: value - contributed,
    cumDiv,
    annualIncome: last.income,
    monthlyIncome: last.income / 12,
    yoc: last.income / contributed,
    blended: { y0, g, p },
    taxRate: tax,
    account: acc,
  };
}
