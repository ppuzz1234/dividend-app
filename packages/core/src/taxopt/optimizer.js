import { ACCOUNTS, deductionRate } from "../knowledge/accounts.js";

/* ------------------------------------------------------------------ *
 *  배당 눈덩이 — 배분 설계 엔진
 *  개인 프로파일(나이·소득·목표)을 받아 시드머니와 월 불입금을
 *  계좌별로 어떻게 나눌지 산출한다.
 *
 *  · 기본 전략: "절세 계좌 우선순위 배분(Waterfall)" — 결정론적 룰
 *  · 전략은 STRATEGIES 레지스트리로 분리 — 추후 점수/최적화 모델을
 *    같은 인터페이스(profile → plan)로 끼워 넣을 수 있음
 *  · 모든 수치는 가정치이며 세무·투자 자문이 아님
 * ------------------------------------------------------------------ */

const byId = Object.fromEntries(ACCOUNTS.map((a) => [a.id, a]));

/**
 * 우선순위 순서대로 금액을 한도(cap)까지 흘려 담는다.
 * @param {number} amount  나눌 총액
 * @param {[string, number][]} order  [계좌id, 연 한도] 우선순위 목록
 * @returns {Record<string, number>} 계좌별 배분액
 */
function fill(amount, order) {
  const out = {};
  let rem = amount;
  for (const [id, cap] of order) {
    const put = Math.max(0, Math.min(rem, cap));
    out[id] = put;
    rem -= put;
    if (rem <= 1e-6) break;
  }
  return out;
}

/**
 * 목표·나이에 따른 연금(저축+IRP) 활용 비율.
 * 현금흐름형은 55세까지 자금이 묶이는 부담을 나이로 보정한다.
 */
function pensionUsage({ goal, age }) {
  if (goal === "retirement") return 1; // 노후형 → 세액공제 한도 풀로
  if (age >= 50) return 1; // 현금흐름형이어도 lock-up이 짧으면 풀로
  if (age >= 40) return 0.6;
  return 0.3; // 젊을수록 묶이는 비용↑ → 연금 비중↓
}

/* ----------------------------- 전략 ----------------------------- */

/** 절세 계좌 우선순위 배분(Waterfall) — 기본 전략 */
function waterfall(profile) {
  const { seed = 0, monthly = 0, age = 40, income = 50_000_000, goal = "retirement" } = profile;

  const dRate = deductionRate(income);
  const pUse = pensionUsage({ goal, age });
  const pensionCap = byId.pension.deductCap * pUse; // 세액공제 한도까지만 우선 배분
  const isaCap = byId.isa.annualLimit;

  // 목표에 따라 우선순위가 갈린다 (cap은 "연 기준")
  const order =
    goal === "retirement"
      ? [["pension", pensionCap], ["isa", isaCap], ["general", Infinity]]
      : [["isa", isaCap], ["pension", pensionCap], ["general", Infinity]];

  const annualInflow = monthly * 12;
  const monthlyByAcc = fill(annualInflow, order); // 연 단위로 분배 후 ÷12
  const seedByAcc = fill(seed, order); // 시드는 일시 분배 (연 한도 동일 적용 — 단순화)

  // 2026 생산적 금융 ISA(청년형) — 자격(나이·소득) 충족 시 ISA 납입금 소득공제액 추정
  const py = byId.isa.productiveYouth;
  const isaAnnual = (seedByAcc.isa || 0) + (monthlyByAcc.isa || 0);
  const youthEligible = !!py && age >= py.minAge && age <= py.maxAge && income <= py.maxIncome;
  const estIsaYouthDeduction = youthEligible
    ? Math.min(isaAnnual * py.incomeDeductRate, py.incomeDeductCap)
    : 0;

  const plan = ACCOUNTS.map((a) => {
    const m = (monthlyByAcc[a.id] || 0) / 12;
    const s = seedByAcc[a.id] || 0;
    return {
      accountId: a.id,
      account: a,
      seed: s,
      monthly: m,
      reason: reasonFor(a.id, { m, s, goal, dRate, pUse, age, youthDeduction: estIsaYouthDeduction }),
    };
  });

  // 연금 세액공제 환급 추정 (연, 월 불입 기준)
  const pensionAnnual = monthlyByAcc.pension || 0;
  const estAnnualRefund = Math.min(pensionAnnual, byId.pension.deductCap) * dRate;

  const pensionTotal = (seedByAcc.pension || 0) + pensionAnnual;
  const warnings = [];
  if (goal === "cashflow" && pensionTotal > 0 && age < 55)
    warnings.push("연금계좌 배분액은 55세 이후 연금으로 수령해야 세제 혜택이 유지됩니다.");
  if ((seedByAcc.isa || 0) + (monthlyByAcc.isa || 0) > byId.isa.annualLimit)
    warnings.push("ISA 연 납입 한도(2,000만원)를 초과하는 시드는 다음 해로 이연됩니다.");
  if (pensionTotal > 0 && byId.pension.riskAssetCap)
    warnings.push(
      `연금계좌(IRP)는 위험자산을 최대 ${Math.round(byId.pension.riskAssetCap * 100)}%까지만 담을 수 있어, 배당주/ETF 비중에 제약이 있습니다(나머지 30%는 안전자산).`
    );

  if (youthEligible && estIsaYouthDeduction > 0)
    warnings.push(
      "청년형 ISA 소득공제(납입금 10%, 최대 200만)는 국내 주식·펀드 대상 '생산적 금융 ISA' 기준이며, 국내상장 해외ETF는 편입할 수 없습니다."
    );

  return {
    strategy: "waterfall",
    deductionRate: dRate,
    pensionUsage: pUse,
    plan,
    estAnnualRefund,
    estIsaYouthDeduction, // 청년형 ISA 소득공제액(과세표준 차감분, 세액공제 환급과 별개)
    youthEligible,
    warnings,
    notes: [
      goal === "retirement"
        ? "노후 자산 목표 → 연금(세액공제) → ISA → 일반 순으로 배분했습니다."
        : "월 현금흐름 목표 → ISA → 연금 → 일반 순으로 배분했습니다.",
      "시드와 월 불입금은 각각 한도까지 채워 담는 단순화 모델입니다.",
      ...(pensionTotal > 0
        ? ["연금 수령 연차는 '처음 받기 시작한 해'부터 산정돼요. 55세에 소액으로 미리 개시해두면 장기수령 절세(20년 초과 구간)에 유리합니다."]
        : []),
      ...(estIsaYouthDeduction > 0
        ? [`청년형(만 ${py.minAge}~${py.maxAge}세·연소득 7,500만 이하) 대상이라 ISA 납입금의 10%인 약 ${Math.round(estIsaYouthDeduction / 10000)}만원을 소득공제로 받을 수 있어요.`]
        : []),
    ],
  };
}

/** 계좌별 배분 사유 문구 */
function reasonFor(id, { m, s, goal, dRate, pUse, youthDeduction = 0 }) {
  if (m <= 0 && s <= 0) return "이번 배분에서는 사용하지 않았어요.";
  if (id === "pension") {
    const pct = Math.round(dRate * 1000) / 10;
    const cut = pUse < 1 ? ` (55세 인출 제약 고려해 한도의 ${Math.round(pUse * 100)}%만)` : "";
    return `세액공제 ${pct}% 환급 + 과세이연으로 가장 먼저 채웠어요${cut}.`;
  }
  if (id === "isa") {
    const base =
      goal === "cashflow"
        ? "비과세·분리과세로 현금흐름에 유리해 우선 배분했어요."
        : "연금 한도 소진 후 비과세 한도까지 활용했어요.";
    return youthDeduction > 0
      ? `${base} 청년형이라 납입금의 10%(약 ${Math.round(youthDeduction / 10000)}만원) 소득공제도 받아요.`
      : base;
  }
  return "절세계좌 한도를 넘는 금액을 담았어요 (배당세 15.4%).";
}

/* --------------------------- 레지스트리 -------------------------- */

const STRATEGIES = {
  waterfall,
  // optimize: (profile) => { ... }  // 추후: 세후수익·목표달성 점수 최적화
};

/**
 * 배분 설계 진입점.
 * @param {object} profile  { seed, monthly, age, income, goal, riskTolerance }
 * @param {object} [opts]   { strategy }
 * @returns 배분 결과 (plan, 환급추정, 경고 등)
 */
export function allocate(profile, { strategy = "waterfall" } = {}) {
  const fn = STRATEGIES[strategy] || waterfall;
  return fn(profile);
}

export const ALLOCATION_STRATEGIES = Object.keys(STRATEGIES);
