import { STOCKS } from "../knowledge/stocks.js";
import { ACCOUNTS, PENSION_WITHDRAWAL, COMP_TAX } from "../knowledge/accounts.js";
import { avg } from "../util/format.js";

/* ------------------------------------------------------------------ *
 *  배당 눈덩이 시뮬레이션
 *  · 단일 통화(원) 정규화, 표기 수익률은 예시 가정치
 *  · 투자 권유가 아니며 실제 수익을 보장하지 않음
 * ------------------------------------------------------------------ */

/** 보유 종목 묶음 → 평균 배당/성장 가정치 블렌딩 */
export function blend(holdings) {
  const list = holdings?.length ? holdings : STOCKS.filter((s) => s.elite);
  return {
    y0: avg(list.map((s) => s.yield)),
    g: avg(list.map((s) => s.divG)),
    p: avg(list.map((s) => s.priceG)),
  };
}

/** 단일 계좌 월단위 복리 시뮬레이션 (배분 엔진의 계좌별 계산 단위)
 *  settle 지정 시(=ISA) 배당을 주기 내 과세이연했다가 만기(롤오버)마다
 *  비과세 한도(taxFree)를 적용하고 초과분만 excessRate 로 정산한다.
 *  settle: { cycleMonths, taxFree, excessRate } | null
 */
export function simulateOne({ seed, monthly, years, blended, reinvest, tax, fee = 0, settle = null }) {
  const { y0, g, p } = blended;
  const n = years * 12;
  const rp = Math.pow(1 + p, 1 / 12) - 1;
  const feeM = fee / 12; // 월 환산 총비용부담률(연 보수)
  const snapRate = settle ? settle.excessRate : tax; // 연차 스냅샷 표기용 세율

  let value = seed,
    contributed = seed,
    cumDiv = 0,
    cycleDiv = 0, // 현재 롤오버 주기에 쌓인 배당(비과세 한도 계산용)
    settledTax = 0; // ISA 만기 정산 누적 세금

  const settleCycle = () => {
    // 주기 순이익 중 비과세 한도 초과분만 저율 과세
    const t = Math.max(0, cycleDiv - settle.taxFree) * settle.excessRate;
    value -= t;
    cumDiv -= t; // 순배당으로 환산
    settledTax += t;
    cycleDiv = 0;
  };

  const series = [{ year: 0, value: seed, principal: seed, gain: 0, income: seed * y0 }];

  for (let m = 1; m <= n; m++) {
    value *= 1 + rp;
    if (feeM) value -= value * feeM; // 연 보수 차감 (수수료 drag)
    const yNow = y0 * Math.pow((1 + g) / (1 + p), m / 12);
    const divGross = value * (yNow / 12);

    if (settle) {
      // 주기 내 과세이연 — 총배당을 그대로 재투자, 세금은 만기에 정산
      cumDiv += divGross;
      if (reinvest) value += divGross;
      cycleDiv += divGross;
      if (m % settle.cycleMonths === 0) settleCycle(); // 3년 만기 = 롤오버 정산
    } else {
      const div = divGross * (1 - tax);
      cumDiv += div;
      if (reinvest) value += div;
    }

    value += monthly;
    contributed += monthly;
    if (m % 12 === 0)
      series.push({
        year: m / 12,
        value,
        principal: contributed,
        gain: Math.max(0, value - contributed),
        income: value * yNow * (1 - snapRate),
      });
  }

  // 마지막 미완결 주기(만기 전 현재 시점) 정산
  if (settle && cycleDiv > 0) {
    settleCycle();
    const last = series[series.length - 1];
    last.value = value;
    last.gain = Math.max(0, value - contributed);
  }

  const last = series[series.length - 1];
  return {
    series,
    finalValue: value,
    contributed,
    gain: value - contributed,
    cumDiv,
    settledTax, // ISA 만기 정산 누적 세금 (비과세 적용 후)
    annualIncome: last.income,
    monthlyIncome: last.income / 12,
    yoc: contributed > 0 ? last.income / contributed : 0,
  };
}

/** 계좌 메타 → ISA면 롤오버 정산 설정 생성 */
function isaSettle(acc) {
  return acc.id === "isa"
    ? { cycleMonths: (acc.minTermYears || 3) * 12, taxFree: acc.taxFree || 0, excessRate: acc.tax }
    : null;
}

/** 단일 계좌 시뮬레이션 (기존 화면 호환용) */
export function simulate({ seed, monthly, years, holdings, reinvest, account }) {
  const blended = blend(holdings);
  const acc = ACCOUNTS.find((a) => a.id === account) || ACCOUNTS[0];
  const r = simulateOne({ seed, monthly, years, blended, reinvest, tax: acc.tax, fee: acc.feeRate, settle: isaSettle(acc) });
  return { ...r, blended, taxRate: acc.tax, account: acc };
}

/* 빈 계좌 합산용 0 시계열 한 점 */
const zero = (year) => ({ year, value: 0, principal: 0, gain: 0, income: 0 });

/**
 * 배분안(plan)에 따른 멀티계좌 시뮬레이션 + 절세효과 비교.
 * @param {object} args  { plan, years, holdings, reinvest }
 *   plan: [{ accountId, seed, monthly }, ...] (allocate() 결과의 plan)
 */
/**
 * @param {object} p
 * @param {Array}  p.plan      계좌별 배분안
 * @param {number} p.years
 * @param {Array}  [p.holdings] 보유 종목 — blended 미전달 시 이 종목들로 가정치를 블렌딩
 * @param {boolean} p.reinvest
 * @param {{y0:number,g:number,p:number}} [p.blended]
 *   수익률 가정 직접 지정. 온보딩·전략 화면이 ETF 벤치마크(연 10%)로 역산하므로,
 *   최종 시뮬레이션도 같은 가정을 받아 두 화면의 숫자가 어긋나지 않게 한다.
 */
export function simulatePortfolio({ plan, years, holdings, reinvest, blended: blendedOverride }) {
  const blended = blendedOverride ?? blend(holdings);

  const perAccount = plan
    .filter((p) => p.seed > 0 || p.monthly > 0)
    .map((p) => {
      const acc = ACCOUNTS.find((a) => a.id === p.accountId) || ACCOUNTS[0];
      const r = simulateOne({ seed: p.seed, monthly: p.monthly, years, blended, reinvest, tax: acc.tax, fee: acc.feeRate, settle: isaSettle(acc) });
      // 연금계좌는 인출 시 연금소득세 차감 → 세후 실수령 추정
      const withdrawalTax = acc.id === "pension" ? r.finalValue * PENSION_WITHDRAWAL.defaultRate : 0;
      return { accountId: p.accountId, account: acc, seed: p.seed, monthly: p.monthly, withdrawalTax, ...r };
    });

  // 연도별 합산 (모든 계좌가 동일 years → 인덱스 정렬됨)
  const points = years + 1;
  const series = Array.from({ length: points }, (_, i) => {
    const acc0 = perAccount[0]?.series[i] ?? zero(i);
    return perAccount.reduce(
      (o, a) => {
        const s = a.series[i] ?? zero(acc0.year);
        return {
          year: acc0.year,
          value: o.value + s.value,
          principal: o.principal + s.principal,
          gain: o.gain + s.gain,
          income: o.income + s.income,
        };
      },
      zero(acc0.year)
    );
  });

  const agg = perAccount.reduce(
    (o, a) => ({
      finalValue: o.finalValue + a.finalValue,
      contributed: o.contributed + a.contributed,
      cumDiv: o.cumDiv + a.cumDiv,
      annualIncome: o.annualIncome + a.annualIncome,
    }),
    { finalValue: 0, contributed: 0, cumDiv: 0, annualIncome: 0 }
  );

  // 비교 기준선: 전액 일반계좌(배당세 15.4%)로 굴렸을 때
  const totalSeed = plan.reduce((s, p) => s + p.seed, 0);
  const totalMonthly = plan.reduce((s, p) => s + p.monthly, 0);
  const general = ACCOUNTS.find((a) => a.id === "general");
  const baseline = simulateOne({ seed: totalSeed, monthly: totalMonthly, years, blended, reinvest, tax: general.tax, fee: general.feeRate });

  // 연금 인출세 합계 → 세후 실수령 평가액
  const pensionWithdrawalTax = perAccount.reduce((s, a) => s + a.withdrawalTax, 0);
  const netFinalValue = agg.finalValue - pensionWithdrawalTax;

  // 금융소득종합과세 경고: 일반계좌 세전 연 배당이 2,000만 초과 시
  const generalAcc = perAccount.find((a) => a.account.id === "general");
  const generalGrossIncome = generalAcc ? generalAcc.annualIncome / (1 - general.tax) : 0;
  const compTaxWarning = generalGrossIncome > COMP_TAX.threshold;

  // ISA 제약: ①3년 만기마다 재가입(롤오버) 필요, ②금융소득종합과세 대상이 되면 재가입 제한
  const isaAcc = perAccount.find((a) => a.account.id === "isa");
  const isaInPlan = !!isaAcc;
  const isaCycle = isaInPlan ? (ACCOUNTS.find((a) => a.id === "isa")?.minTermYears || 3) : 0;
  const isaRolloverCount = isaCycle > 0 ? Math.floor(years / isaCycle) : 0; // 기간 내 롤오버 횟수
  const isaEligibilityRisk = isaInPlan && compTaxWarning; // 종합과세 대상 → 만기 후 재가입 제한 위험

  // 화면 호환을 위한 실효세율(납입금 가중)
  const effTax =
    agg.contributed > 0
      ? perAccount.reduce((s, a) => s + a.account.tax * a.contributed, 0) / agg.contributed
      : 0;

  return {
    series,
    perAccount,
    blended,
    finalValue: agg.finalValue,
    contributed: agg.contributed,
    gain: agg.finalValue - agg.contributed,
    cumDiv: agg.cumDiv,
    annualIncome: agg.annualIncome,
    monthlyIncome: agg.annualIncome / 12,
    yoc: agg.contributed > 0 ? agg.annualIncome / agg.contributed : 0,
    taxSaved: agg.finalValue - baseline.finalValue, // 일반계좌 대비 절세 복리효과(적립단계)
    baseline: { finalValue: baseline.finalValue },
    pensionWithdrawalTax, // 연금 인출 시 예상 연금소득세
    netFinalValue, // 연금 인출세 차감 후 실수령 추정
    compTaxWarning, // 금융소득종합과세 진입 가능성
    isaInPlan, // ISA 배분 포함 여부
    isaCycle, // ISA 의무가입/롤오버 주기(년)
    isaRolloverCount, // 기간 내 ISA 재가입(롤오버) 횟수
    isaEligibilityRisk, // 종합과세 대상 → ISA 재가입 제한 위험
    // 기존 Result 화면 호환 필드
    taxRate: effTax,
    account: { name: "절세 배분 포트폴리오", id: "portfolio" },
  };
}
