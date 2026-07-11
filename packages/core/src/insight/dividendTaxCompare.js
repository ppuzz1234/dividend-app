/* ================================================================== *
 *  은퇴기 배당소득 — 계좌별 소득세·건강보험료 비교 인사이트
 *  ──────────────────────────────────────────────────────────────
 *  "같은 배당 현금흐름도 어느 계좌에서 받느냐"에 따라 세금·건보료가
 *  갈린다는 것을 정량 비교한다. 결과(Result) 화면 최상단 인사이트에 사용.
 *
 *  · 일반계좌: 발생 시점 과세(금융소득종합과세) + 건보료 소득 100% 반영
 *  · 연금계좌(연금저축·IRP, 사적연금): 인출 시 과세, 연 1,500만 초과 시
 *    16.5% 분리과세 선택 가능 + 사적연금은 건보료 산정 소득에서 제외
 *
 *  ⚠ 단순화 추정 모델. 본인 기본공제 외 다른 소득·공제 없음을 가정하고,
 *     건보료는 재산 기준 제외·소득 기준만 반영한 근사치. 세무 자문 아님.
 *  출처: reference/pension-vs-general-2026.js
 * ================================================================== */

/* 2025 종합소득세 과세표준 구간 (누진공제, 국세) */
const INCOME_TAX_BRACKETS = [
  { upTo: 14_000_000, rate: 0.06, deduct: 0 },
  { upTo: 50_000_000, rate: 0.15, deduct: 1_260_000 },
  { upTo: 88_000_000, rate: 0.24, deduct: 5_760_000 },
  { upTo: 150_000_000, rate: 0.35, deduct: 15_440_000 },
  { upTo: 300_000_000, rate: 0.38, deduct: 19_940_000 },
  { upTo: 500_000_000, rate: 0.40, deduct: 25_940_000 },
  { upTo: 1_000_000_000, rate: 0.42, deduct: 35_940_000 },
  { upTo: Infinity, rate: 0.45, deduct: 65_940_000 },
];

const LOCAL_TAX = 0.1; // 지방소득세 = 산출세액의 10%
const BASIC_DEDUCTION = 1_500_000; // 본인 기본공제(단순화)

/* 상수 (출처: reference/pension-vs-general-2026.js) */
export const DIVIDEND_TAX_CONST = {
  compTaxThreshold: 20_000_000, // 금융소득종합과세 기준: 연 2,000만 초과
  withholdingRate: 0.154, // 배당 원천징수(지방 포함)
  privatePensionSeparateRate: 0.165, // 사적연금 분리과세(지방 포함)
  privatePensionThreshold: 15_000_000, // 사적연금 연 1,500만 초과 시 종합과세/분리과세 선택
  pensionLowRate: 0.055, // 1,500만 이하 연금소득세(저율, 55~70세)
  healthDependentIncomeLimit: 10_000_000, // 피부양자 소득요건: 연 1,000만 초과 시 지역가입자 전환
  healthRegionalRate: 0.08, // 지역가입자 소득보험료+장기요양 합산 근사 요율
};

function comprehensiveIncomeTax(base) {
  const b = INCOME_TAX_BRACKETS.find((x) => base <= x.upTo);
  return Math.max(0, base * b.rate - b.deduct);
}

/** 일반계좌 배당: 금융소득종합과세 소득세 추정 (지방세 포함)
 *  비교과세 — 2,000만 초과분만 누진세율, 2,000만까지는 14% 원천징수 유지.
 *  세액 = max( (초과분 누진 + 2,000만×14%), 전액×14% ) × 지방세 가산 */
function generalIncomeTax(annual) {
  const C = DIVIDEND_TAX_CONST;
  if (annual <= C.compTaxThreshold) {
    return Math.round(annual * C.withholdingRate); // 2,000만 이하 분리과세(지방 포함)
  }
  const compBase = Math.max(0, annual - C.compTaxThreshold - BASIC_DEDUCTION);
  const nationalComprehensive = comprehensiveIncomeTax(compBase) + C.compTaxThreshold * 0.14;
  const nationalFlat = annual * 0.14; // 전액 원천징수 비교분
  const national = Math.max(nationalComprehensive, nationalFlat);
  return Math.round(national * (1 + LOCAL_TAX));
}

/** 사적연금 인출 소득세 추정 — 1,500만 초과 시 16.5% 분리과세 선택 가정 */
function pensionIncomeTax(annual) {
  const C = DIVIDEND_TAX_CONST;
  if (annual <= C.privatePensionThreshold) return Math.round(annual * C.pensionLowRate);
  return Math.round(annual * C.privatePensionSeparateRate);
}

/** 지역가입자 건강보험료 추정 (소득 기준) */
function generalHealthPremium(annual) {
  const C = DIVIDEND_TAX_CONST;
  if (annual <= C.healthDependentIncomeLimit) return 0;
  return Math.round(annual * C.healthRegionalRate);
}

/**
 * 같은 배당 수령액을 일반계좌 vs 연금계좌(사적연금)로 받을 때의
 * 소득세·건보료·세후 순수령을 비교한다.
 * @param {object} p
 * @param {number} p.annualDividend  연간 배당/연금 수령액(원)
 * @param {number} [p.age=65]        수령 시 나이(사적연금 저율 판정용, 현재는 참고값)
 * @returns 비교 결과 { annual, general, pension, diff, mechanisms, assumptions }
 */
export function compareDividendTax({ annualDividend = 0, age = 65 } = {}) {
  const annual = Math.max(0, Math.round(annualDividend));

  const gIncomeTax = generalIncomeTax(annual);
  const gHealth = generalHealthPremium(annual);
  const gTotal = gIncomeTax + gHealth;
  const gNet = annual - gTotal;

  const pIncomeTax = pensionIncomeTax(annual);
  const pHealth = 0; // 사적연금은 건보료 산정 소득에서 제외
  const pTotal = pIncomeTax + pHealth;
  const pNet = annual - pTotal;

  const general = {
    accountId: "general",
    label: "일반 주식계좌",
    incomeTax: gIncomeTax,
    incomeTaxNote: annual > DIVIDEND_TAX_CONST.compTaxThreshold ? "금융소득종합과세(누진세율)" : "15.4% 분리과세",
    health: gHealth,
    healthNote: gHealth > 0 ? "지역가입자 전환 · 소득 100% 반영" : "부과 없음",
    total: gTotal,
    net: gNet,
    effectiveRate: annual > 0 ? gTotal / annual : 0,
  };
  const pension = {
    accountId: "pension",
    label: "연금저축 · IRP",
    incomeTax: pIncomeTax,
    incomeTaxNote: annual > DIVIDEND_TAX_CONST.privatePensionThreshold ? "16.5% 분리과세 선택" : "연금소득세 저율",
    health: pHealth,
    healthNote: "사적연금 — 건보료 산정 제외",
    total: pTotal,
    net: pNet,
    effectiveRate: annual > 0 ? pTotal / annual : 0,
  };

  const diff = {
    incomeTax: general.incomeTax - pension.incomeTax,
    health: general.health - pension.health,
    total: general.total - pension.total, // 연금계좌가 아끼는 총액
    netGain: pension.net - general.net, // 연금계좌 세후 순증
  };

  const mechanisms = [
    "누진세율(최고 45%)의 파급을 사적연금 16.5% 분리과세 특례로 차단",
    "건보료 폭탄의 원인인 금융소득을, 건보료 산정에서 빠지는 사적연금 소득으로 치환",
  ];

  const assumptions = [
    "본인 기본공제 외 다른 소득·공제가 없다는 단순화 가정",
    "건보료는 재산 기준을 제외한 소득 기준만 반영한 추산치",
    "사적연금은 연 1,500만 초과 시 16.5% 분리과세를 선택했다고 가정",
  ];

  return { annual, age, general, pension, diff, mechanisms, assumptions };
}

export default compareDividendTax;
