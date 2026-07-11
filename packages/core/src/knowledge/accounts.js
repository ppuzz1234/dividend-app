/* ------------------------------------------------------------------ *
 *  계좌 유형 + 세제 메타데이터 (2025년 기준 가정치)
 *  · 한도·세율은 매년 바뀌므로 "데이터"로 분리 — 배분 엔진은 이 값만 읽음
 *  · 실제 세무 자문이 아니며 투자 권유가 아님
 * ------------------------------------------------------------------ */
export const ACCOUNTS = [
  {
    id: "general",
    name: "일반 위탁계좌",
    desc: "배당소득세 15.4%",
    tax: 0.154, // 배당 과세율
    annualLimit: Infinity, // 연 납입 한도 (원)
    deductCap: 0, // 연 세액공제 한도 (원)
    taxFree: 0, // 비과세 한도 (원)
    lockAge: null, // 인출 제약 나이 (없음)
    liquidity: "high", // 유동성: 언제든 인출
    feeRate: 0, // 직접투자 가정(ETF 보수는 종목 수익률에 내재) — 별도 부과 안 함
  },
  {
    id: "isa",
    name: "ISA 계좌",
    desc: "비과세 후 9.9% 분리과세",
    tax: 0.099, // 비과세 한도 초과분 분리과세 (단순화한 실효세율)
    annualLimit: 20_000_000, // 연 2,000만 (최대 누적 1억)
    deductCap: 0,
    taxFree: 2_000_000, // 순이익 200만 비과세 (서민형 400만)
    lockAge: null, // 의무가입 3년 (lockAge 대신 별도 표기)
    minTermYears: 3,
    liquidity: "mid",
    feeRate: 0,
    // 2026 생산적 금융 ISA(청년형) — 납입금 소득공제 (출처: isa-productive-2026)
    // 자격 충족 시 엔진이 소득공제액(과세표준 차감분)을 추정. 국민성장형·상품범위는 미확정이라 미반영.
    productiveYouth: {
      minAge: 19, // 만 19~34세
      maxAge: 34,
      maxIncome: 75_000_000, // 연소득 7,500만 이하
      incomeDeductRate: 0.1, // 납입금 10% 소득공제
      incomeDeductCap: 2_000_000, // 최대 200만 소득공제
    },
  },
  {
    id: "pension",
    name: "연금저축 · IRP",
    desc: "세액공제 + 과세이연 (적립기간 비과세)",
    tax: 0, // 적립기간 과세이연 (수령 시 연금소득세 3.3~5.5%)
    annualLimit: 18_000_000, // 연 납입 한도 (연금저축+IRP 합산)
    deductCap: 9_000_000, // 연 세액공제 한도 (연금저축 600만 + IRP 합산 900만)
    taxFree: 0,
    lockAge: 55, // 55세 이후 연금 수령 (중도해지 시 기타소득세 16.5%)
    liquidity: "low",
    feeRate: 0.0031, // IRP 총비용부담률 0.311% (퇴직연금 백서 2025)
    riskAssetCap: 0.7, // 위험자산 최대 70%, 안전자산 ≥30% (IRP, 삼성증권·백서)
  },
];

/* ----------------------------------------------------------------- *
 *  레퍼런스에서 승격한 세제 상수 (data/reference/* 출처)
 * ----------------------------------------------------------------- */

/* 연금계좌 인출단계 과세 (삼성증권 IRP + 인모스트 연금레터 89호) */
export const PENSION_WITHDRAWAL = {
  // 연금소득세 (본인 납입원금+수익 연금수령 시, 연령별)
  incomeTaxByAge: [
    { minAge: 55, maxAge: 70, rate: 0.055 },
    { minAge: 70, maxAge: 80, rate: 0.044 },
    { minAge: 80, maxAge: Infinity, rate: 0.033 },
  ],
  annualThreshold: 15_000_000, // 연 연금수령 1,500만 초과 시 종합과세 또는 분리과세
  separateRate: 0.165, // 분리과세 선택 시
  defaultRate: 0.044, // 시뮬레이션 기본 가정(55~80세 평균대)
  longTermReductionNote: "2026~ 수령 '20년 초과' 구간 신설 → 장기 연금수령 시 추가 감면",
};

/* 금융소득종합과세 (인모스트 연금레터 89호 — 배당가산율 2027~ 11%) */
export const COMP_TAX = {
  threshold: 20_000_000, // 연 금융소득 2,000만 초과 시 종합과세
  grossUp: 0.11, // 배당가산율(2027~), 직전 10%
  baseSeparateRate: 0.154, // 2,000만 이하 분리과세
};

/* 소득 구간별 연금 세액공제율 (지방세 포함, 2025 가정) */
export function deductionRate(annualIncome) {
  return annualIncome <= 55_000_000 ? 0.165 : 0.132;
}
