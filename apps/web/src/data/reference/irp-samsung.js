/* ------------------------------------------------------------------ *
 *  레퍼런스 데이터 — IRP(개인형 퇴직연금)
 *  출처: 삼성증권 | 수집일: 2026-06-24 | 기준연도: 2026
 *
 *  ⚠ 엔진이 직접 import 하지 않는 "원천 자료"입니다.
 *     배분/세제 룰에 반영할 값은 검토 후 data/accounts.js 등으로 승격합니다.
 *     (여러 출처를 data/reference/* 에 순차 수집 중 — index.js 참조)
 * ------------------------------------------------------------------ */
export const IRP_SAMSUNG = {
  source: "삼성증권",
  account: "IRP (개인형 퇴직연금)",
  effectiveYear: 2026,
  collectedAt: "2026-06-24",

  concept:
    "퇴직금을 보관하거나 본인이 직접 납입해 노후 자금을 준비하는 개인형 퇴직연금 계좌",
  eligibility:
    "소득 증빙 가능한 모든 경제활동 인구 (근로자·자영업자·공무원·교직원·군인 등)",

  /* 세액공제 (연금저축과 합산) */
  deduction: {
    combinedWithPensionSavings: true,
    annualCap: 9_000_000, // 연 최대 900만원 세액공제 한도
    brackets: [
      // 총급여 5,500만 이하 (종합소득 4,500만 이하)
      { maxTotalSalary: 55_000_000, maxComprehensiveIncome: 45_000_000, rate: 0.165, maxRefund: 1_485_000 },
      // 초과 구간
      { maxTotalSalary: Infinity, maxComprehensiveIncome: Infinity, rate: 0.132, maxRefund: 1_188_000 },
    ],
    // ISA 만기자금을 60일 내 IRP로 전환 시 일회성 추가 공제 한도
    isaTransferBonus: { withinDays: 60, rate: 0.1, cap: 3_000_000, oneTime: true },
  },

  /* 운용 제약 */
  riskAssetCap: 0.7, // 위험자산 최대 70% (안전자산 ≥30% 의무)
  prohibitedAssets: ["개별 종목 주식", "레버리지/인버스 ETF"],

  /* 연금 수령 */
  withdrawal: {
    eligibility: { minAge: 55, minYears: 5, retirementFundException: true }, // 퇴직금 계좌는 가입기간 무관
    // 본인 납입원금+수익 연금수령 시 연금소득세 (연령별)
    pensionIncomeTax: [
      { minAge: 55, maxAge: 70, rate: 0.055 },
      { minAge: 70, maxAge: 80, rate: 0.044 },
      { minAge: 80, maxAge: Infinity, rate: 0.033 },
    ],
    annualPensionThreshold: 15_000_000, // 초과 시 종합과세 또는 분리과세 선택
    separateTaxRate: 0.165, // 분리과세 선택 시
    // 퇴직금 연금수령 시 퇴직소득세 감면 (수령 연차별)
    retirementTaxReduction: [
      { yearFrom: 1, yearTo: 10, reduction: 0.3 },
      { yearFrom: 11, yearTo: 20, reduction: 0.4 },
      { yearFrom: 21, yearTo: Infinity, reduction: 0.5 },
    ],
    tip: "퇴직금은 일시금이 아닌 10년 이상 장기 연금으로 나눠 수령해야 절세 효과가 가장 큼",
  },

  /* 중도해지 페널티 */
  earlyWithdrawal: {
    otherIncomeTax: 0.165, // 세액공제 원금+운용수익에 기타소득세 16.5%
    retirementTaxRestored: true, // 이연 퇴직금 일시 인출 시 감면 소멸, 퇴직소득세 전액
    hardshipExceptions: ["6개월 이상 요양", "파산 선고", "천재지변"],
    hardshipTaxRate: { min: 0.033, max: 0.055 }, // 부득이한 사유 시 저율
  },
};

export default IRP_SAMSUNG;
