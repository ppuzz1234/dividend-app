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
  /* 피부양자 판정은 2단계 구조 —
   * ① 산입 임계: 금융소득 연 1,000만 초과 시 '전액'이 소득에 산입 (이하면 0으로 침)
   * ② 상실 임계: 산입된 종합소득 합계가 연 2,000만 초과 시 피부양자 자격 상실 → 지역가입자 전환 */
  healthFinIncomeIncludeLimit: 10_000_000, // ① 금융소득 전액 산입 임계
  healthDependentLossLimit: 20_000_000, // ② 피부양자 소득요건(상실 임계)
  healthDependentIncomeLimit: 10_000_000, // (구 명칭 호환 — ①과 동일 값. 신규 코드는 위 두 키 사용)
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

/** 지역가입자 건강보험료 추정 (소득 기준) — 다른 소득 없는 은퇴자(피부양자) 가정.
 *  금융소득 1,000만 이하: 산입 자체가 안 되어 피부양자 유지(보험료 0)
 *  1,000만~2,000만: 전액 산입되지만 소득요건(2,000만) 이내라 피부양자 유지(보험료 0)
 *  2,000만 초과: 피부양자 상실 → 지역가입자 전환, 배당 전액에 약 8% 부과 */
function generalHealthPremium(annual) {
  const C = DIVIDEND_TAX_CONST;
  if (annual <= C.healthDependentLossLimit) return 0;
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

  const overComp = annual > DIVIDEND_TAX_CONST.compTaxThreshold;
  const overPension = annual > DIVIDEND_TAX_CONST.privatePensionThreshold;

  const general = {
    accountId: "general",
    label: "일반 주식계좌",
    caption: "발생 시점 과세 · 건보료 반영",
    incomeTax: gIncomeTax,
    incomeTaxNote: overComp ? "금융소득종합과세(누진세율)" : "15.4% 분리과세",
    health: gHealth,
    healthNote: gHealth > 0 ? "피부양자 상실 · 지역가입자 전환" : "부과 없음 (피부양자 유지)",
    total: gTotal,
    net: gNet,
    effectiveRate: annual > 0 ? gTotal / annual : 0,
    // 상세보기 팝업용 세법 설명
    taxLaw: overComp
      ? "연 배당이 2,000만원을 넘으면 금융소득종합과세 대상이에요. 2,000만원까지는 14%(지방 포함 15.4%) 원천징수로 유지되지만, 초과분은 근로·사업 등 다른 소득과 합산되어 6~45% 누진세율로 과세되고 배당가산(Gross-up 11%)까지 붙어요. 소득이 커질수록 최고 49.5%(지방세 포함)까지 올라갈 수 있어요."
      : "연 2,000만원 이하 배당은 15.4%(소득세 14% + 지방소득세 1.4%) 원천징수로 분리과세돼요. 종합소득에 합산되지 않아 세율이 고정되고, 별도 신고 없이 정산이 끝나요.",
    healthLaw: gHealth > 0
      ? "피부양자 소득요건은 2단계예요. 금융소득이 연 1,000만원을 넘으면 전액이 소득에 산입되고, 산입된 소득 합계가 2,000만원을 넘으면 피부양자 자격을 잃어 지역가입자로 전환돼요. 이때 배당소득 100%가 보험료 부과 대상이 되어 소득보험료+장기요양 합산 약 8%가 매년 추가로 부과돼요."
      : annual > DIVIDEND_TAX_CONST.healthFinIncomeIncludeLimit
        ? "금융소득이 연 1,000만원을 넘어 전액이 소득에 산입되지만, 합계가 피부양자 소득요건(연 2,000만원) 이내라 자격은 유지돼요. 단 다른 소득이 더해져 2,000만원을 넘는 순간 지역가입자로 전환되니 여유가 크지 않아요."
        : "금융소득이 연 1,000만원 이하면 건보 소득 산정에 아예 잡히지 않아, 피부양자 자격이 안전하게 유지돼요.",
    savingPoint: "배당이 발생하는 시점에 즉시 과세되고 건보료까지 얹혀, 배당 규모가 커질수록 실효 부담이 가파르게 오르는 구조예요.",
  };
  const pension = {
    accountId: "pension",
    label: "연금저축 · IRP",
    caption: "분리과세 · 건보료 제외",
    incomeTax: pIncomeTax,
    incomeTaxNote: overPension ? "16.5% 분리과세 선택" : "연금소득세 저율",
    health: pHealth,
    healthNote: "사적연금 — 건보료 산정 제외",
    total: pTotal,
    net: pNet,
    effectiveRate: annual > 0 ? pTotal / annual : 0,
    taxLaw: overPension
      ? "사적연금(연금저축·IRP) 인출액이 연 1,500만원을 넘으면, 종합과세 대신 16.5% 분리과세를 선택할 수 있어요. 누진세율이 아닌 단일세율이라 수령액이 클수록 일반계좌 대비 유리해요. (적립 단계에서 이미 세액공제를 받은 재원이라 인출 시 과세하는 구조)"
      : "만 55세 이후 연금으로 나눠 받으면, 연 1,500만원까지 저율 연금소득세(3.3~5.5%)만 부담해요. 수령 나이가 많을수록(70세·80세) 세율이 더 낮아지고, 과세이연으로 불린 재원을 낮은 세율로 인출할 수 있어요.",
    healthLaw: "국민건강보험법상 사적연금 소득은 건강보험료 산정 대상에서 제외돼요. 연금을 아무리 많이 받아도 건보료가 늘지 않고, 피부양자 자격 유지에도 유리해요.",
    savingPoint: "누진세율의 파급과 건보료 폭탄을 동시에 피할 수 있어, 같은 배당 현금흐름도 더 많이 손에 쥐게 돼요.",
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
