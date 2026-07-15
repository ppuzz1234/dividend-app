import { simulateOne } from "./simulate.js";
import { ETF_BENCHMARKS } from "../knowledge/etfBenchmarks.js";

/* 온보딩 훅 화면용 — "20년 뒤 매달 목표 생활비를 받으려면?" 역산 시나리오.
 * ① 목표 월 생활비 → 연 4% 인출 가정으로 필요한 은퇴 시점 기초자산(시드) 역산
 * ② 그 시드를 20년간 만들려면 ETF_BENCHMARKS 각각의 연환산 수익률 기준으로
 *    매달 얼마씩 불입해야 하는지 역산 (배당 재투자 가정) */
const WITHDRAWAL_RATE = 0.04; // 은퇴 후 연 인출률(4% 룰)

/* seed=0 이면 simulateOne 의 최종자산은 monthly 에 정비례하므로(선형 시스템),
 * monthly=1 로 한 번만 시뮬레이션해 단위 계수를 구하고 목표액을 역산한다. */
function requiredMonthlyFor(targetFV, { years, blended, reinvest, tax, fee }) {
  const unit = simulateOne({ seed: 0, monthly: 1, years, blended, reinvest, tax, fee }).finalValue;
  return unit > 0 ? targetFV / unit : 0;
}

export function projectRetirementScenario({ monthlyLivingCost, years = 20, tax = 0.154 }) {
  const requiredNestEgg = (monthlyLivingCost * 12) / WITHDRAWAL_RATE;

  const perEtf = ETF_BENCHMARKS.map((etf) => {
    const requiredMonthly = requiredMonthlyFor(requiredNestEgg, {
      years,
      blended: { y0: etf.yield, g: etf.divG, p: etf.priceG },
      reinvest: true,
      tax,
      fee: etf.expenseRatio,
    });
    return { etf, requiredMonthly };
  });

  return { requiredNestEgg, withdrawalRate: WITHDRAWAL_RATE, perEtf };
}
