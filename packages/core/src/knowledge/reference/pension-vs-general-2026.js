/* ------------------------------------------------------------------ *
 *  레퍼런스 데이터 — 은퇴기 배당소득 계좌별 세금·건보료 비교 근거
 *  주제: "65세 연 3억 배당, 일반계좌 vs 연금저축 계좌"
 *  수집일: 2026-07-11
 *
 *  ⚠ insight/dividendTaxCompare.js 의 상수·산식 근거 자료.
 *     단순화 추정 기준이며 최종 세액·건보료는 개인 상황에 따라 다름.
 *     세무·건강보험 자문이 아님.
 * ------------------------------------------------------------------ */
export const PENSION_VS_GENERAL_2026 = {
  source: "은퇴 배당 현금흐름 계좌 비교(내부 정리)",
  title: "배당소득 발생 계좌에 따른 소득세·건강보험료 비교",
  collectedAt: "2026-07-11",
  disclaimer:
    "본인 기본공제 외 다른 소득·공제 없음을 가정한 단순화 추정. 건보료는 소득 기준만 반영. 세무/건강보험 자문 아님.",

  rules: [
    {
      id: "comp-tax",
      topic: "금융소득종합과세",
      gist: "일반계좌 배당은 발생 시점 과세. 연 2,000만 초과 시 다른 종합소득과 합산 누진과세(최고 45%+지방세).",
      threshold: 20_000_000,
      withholdingRate: 0.154,
    },
    {
      id: "private-pension-separate",
      topic: "사적연금 분리과세",
      gist: "연금저축·IRP 인출액은 발생 시점 과세이연. 연 1,500만 초과 시 종합과세 대신 16.5% 분리과세 선택 가능.",
      threshold: 15_000_000,
      separateRate: 0.165,
      lowRateByAge: [
        { minAge: 55, maxAge: 70, rate: 0.055 },
        { minAge: 70, maxAge: 80, rate: 0.044 },
        { minAge: 80, maxAge: Infinity, rate: 0.033 },
      ],
    },
    {
      id: "health-dependent",
      topic: "건강보험 피부양자 → 지역가입자",
      gist: "일반계좌 금융소득 연 1,000만 초과 시 피부양자 상실·지역가입자 전환, 소득 100% 건보료 반영.",
      dependentIncomeLimit: 10_000_000,
      regionalRateApprox: 0.08, // 소득보험료 + 장기요양보험료 합산 근사
    },
    {
      id: "health-private-pension-excluded",
      topic: "사적연금 건보료 제외",
      gist: "공적연금(국민연금 등)은 건보료 소득에 포함되나, 연금저축·IRP 사적연금 수령액은 건보료 산정에서 제외.",
      included: ["공적연금"],
      excluded: ["연금저축", "IRP(사적연금)"],
    },
  ],

  /* 예시 시나리오 (65세, 연 3억 수령) — 모델 검증용 근사치 */
  exampleScenario: {
    annual: 300_000_000,
    age: 65,
    general: { incomeTaxApprox: 98_200_000, healthApprox: 24_000_000 },
    pension: { incomeTax: 49_500_000, health: 0 },
    netGainApprox: 72_700_000,
  },

  engineCandidates: [
    "✅ insight/dividendTaxCompare.js 로 승격 — 결과 화면 최상단 계좌별 세금·건보료 비교 인사이트에 사용",
  ],
};

export default PENSION_VS_GENERAL_2026;
