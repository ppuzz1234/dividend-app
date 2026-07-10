/* ------------------------------------------------------------------ *
 *  레퍼런스 데이터 — 2025년 우리나라 퇴직연금 투자 백서
 *  출처: 고용노동부 · 금융감독원 (관계부처 합동)
 *  보도시점: 2026-05-20 | 기준연도: 2025 | 수집일: 2026-06-24
 *
 *  ⚠ 엔진이 직접 import 하지 않는 "원천 자료"입니다.
 *     이 백서는 시장 통계 자료로, 엔진에 승격할 후보는 주로
 *     (1) 운용방법/제도별 현실적 기대수익률, (2) 총비용부담률(수수료 drag),
 *     (3) 장기 복리 시뮬레이션 비교 사례 입니다. (engineCandidates 참조)
 * ------------------------------------------------------------------ */
export const RETIREMENT_WHITEPAPER_2025 = {
  source: "고용노동부·금융감독원",
  title: "2025년 우리나라 퇴직연금 투자 백서",
  publishedAt: "2026-05-20",
  baseYear: 2025,
  collectedAt: "2026-06-24",
  unit: "조원(적립금), %(수익률·비중)",

  /* ── 핵심 요약 ── */
  summary: {
    totalAUM: 501.4, // 적립금 총액(조원), 400조 경신 1년 만에 500조 돌파
    yoyGrowthRate: 0.168, // 전년 대비 증가율(보도자료 요약 표기)
    avgReturn: 0.065, // 전체 평균 수익률(제도 도입 이래 최고)
    realInvestRatio: 0.246, // 실적배당형 비중(3년간 2배 성장)
    dcIrpShare: 0.543, // DC+IRP 합산 비중
  },

  /* ── Ⅰ. 적립금 현황 ── */
  aum: {
    total: 501.4,
    totalYoY: { delta: 69.7, rate: 0.161 }, // 전년 431.7조 대비
    byScheme: {
      // 제도유형별 (조원, 비중, 전년대비 증가율)
      DB: { amount: 228.9, share: 0.457, yoy: { delta: 14.3, rate: 0.067 }, trend: "비중 감소" },
      DC: { amount: 141.6, share: 0.282, yoy: { delta: 23.2, rate: 0.196 } },
      IRP: { amount: 130.9, share: 0.261, yoy: { delta: 32.2, rate: 0.326 }, note: "2년 연속 30%+ 성장" },
    },
    byMethod: {
      // 운용방법별
      principalGuaranteed: {
        amount: 378.1,
        share: 0.754,
        shareByScheme: { DB: 0.919, DC: 0.67, IRP: 0.557 }, // 모든 제도에서 감소 추세
        products: { 예적금: 147.8, 보험: 143.5, ELB: 37.1 }, // 조원
      },
      realInvest: {
        amount: 123.3,
        share: 0.246,
        shareYoY: 0.072, // +7.2%p
        shareByScheme: { DB: 0.081, DC: 0.33, IRP: 0.443 }, // 실적배당형 운용 비중
        products: { 집합투자증권: 115.7, 회사채등: 6.4, 실적배당형보험: 1.2 },
        etf: { amount: 48.7, yoyRate: 1.319, shareWithinRealInvest: 0.396, kospi200EtfYoY: 3.176 },
        tdf: { amount: 20.1, yoyRate: 0.5, shareOfPublicTdf: 0.785 }, // 공모 TDF 순자산 25.6조의 78.5%
      },
    },
    byChannel: {
      // 금융권역별 (운용관리기관 기준)
      은행: { amount: 260.5, share: 0.52, realInvestShare: 0.191 },
      증권: { amount: 131.5, share: 0.262, realInvestShare: 0.452, trend: "+2.1%p 확대" },
      생명보험: { amount: 87.8, share: 0.175, realInvestShare: 0.149 },
      손해보험: { amount: 16.8, share: 0.034, realInvestShare: 0.039 },
      근로복지공단: { amount: 4.5, share: 0.009, realInvestShare: 0.063 },
    },
  },

  /* ── Ⅱ. 수익률 ── */
  returns: {
    overall2025: 0.0647, // 전체 평균, 전년 대비 +1.7%p
    byScheme: { DB: 0.0353, DC: 0.0847, IRP: 0.0944 },
    byMethod: {
      principalGuaranteed: { rate: 0.0309, yoy: -0.0058 }, // 금리 인하 영향
      realInvest: { rate: 0.168, yoy: 0.0684 }, // 주식시장 상승
    },
    byChannel: { 증권: 0.0979, 은행: 0.0527, 생명보험: 0.0453, 근로복지공단: 0.0416, 손해보험: 0.0381 },
    // 장기 연환산 수익률 (총비용 차감 후) — 엔진의 보수적 가정 후보
    longTermAnnualized: {
      overall: { y5: 0.0329, y10: 0.0264 },
      byScheme: {
        DB: { y5: 0.0281, y10: 0.0227 },
        DC: { y5: 0.0375, y10: 0.0309 },
        IRP: { y5: 0.0383, y10: 0.0299 },
      },
      topChannel: { 증권: { y5: 0.0309, y10: 0.0251 } },
    },
    // 벤치마크 비교 (참고): 코스피 +75.6%, 국민연금 19.9%, 미국 12.2%, 일본 12.3%
    benchmarks2024: { KOSPI: 0.756, NPS: 0.199, CalPERS: 0.122, GPIF: 0.123 },
    products: { TDF: 0.137, 디폴트옵션중립투자형: 0.108, 디폴트옵션전체: 0.037 },
  },

  /* ── Ⅲ. 총비용부담률 (수수료 drag) ── */
  costs: {
    totalRatio: 0.00407, // 전체 0.407%, 전년 대비 -0.007%p
    components: { 운용관리수수료: 0.00145, 자산관리수수료: 0.00168, 펀드비용: 0.00094 },
    byScheme: { DB: 0.0038, DC: 0.00538, IRP: 0.00311 },
    byChannel: { 근로복지공단: 0.00078, 증권: 0.00335, 손해보험: 0.00345, 생명보험: 0.00399, 은행: 0.00451 },
    note: "적립금 규모가 클수록 부담률이 낮아지는 경향(30억 초과 0.078%)",
  },

  /* ── Ⅳ. 수급형태 (연금 vs 일시금) ── */
  payout: {
    accounts: { total: 60.1, pensionShare: 0.835, lumpSumShare: 0.165 }, // 만좌 기준
    amount: { total: 23.9, pensionShare: 0.616, lumpSumShare: 0.384, note: "연금 비중 첫 60% 돌파" }, // 조원
    avgPerAccount: { pension: 14891, lumpSum: 1833, ratio: 8.13 }, // 만원
    pensionFrequency: { 월: 0.759, 년: 0.131, 기타: 0.092, 분기: 0.012, 반기: 0.0051 },
  },

  /* ── 행태 심층분석: 상·하위 10% ── */
  behaviorTop10: { return: 0.195, realInvestShare: 0.84, gainFromReturn: 0.67 },
  behaviorBottom10: { return: 0.005, principalGuaranteedShare: 0.74, note: "납입금 의존 구조" },

  /* ── 장기 복리 시뮬레이션 (백서 사례) ── */
  // 매년 1천만원씩 20년간 총 2억원 납입 가정 (2006~2025 실제수익률 적용)
  compoundCase: {
    annualContribution: 10_000_000,
    years: 20,
    totalContributed: 200_000_000,
    portfolioA_active: 430_000_000, // 적극적 자산배분 → 약 4.3억
    portfolioB_guaranteed: 270_000_000, // 원리금보장형 위주 → 약 2.7억
    gap: 160_000_000, // 약 1.6배 차이
    snapshots: [
      // 단위 만원 (원자료 표기), A vs B
      { year: 5, A: 5912, B: 5517, diff: 394 },
      { year: 10, A: 12939, B: 11750, diff: 1189 },
      { year: 15, A: 23415, B: 18112, diff: 5303 },
      { year: 20, A: 42948, B: 27220, diff: 15728 },
    ],
  },

  /* ── 향후 정책 ── */
  policy: ["하반기 퇴직연금 가이드북 발간", "6월 중 연금저축 운용현황 보도자료", "디폴트옵션 평가·승인취소 제도 검토", "기금형 퇴직연금제도 도입 추진"],

  /* ── 엔진 승격 후보 ── */
  engineCandidates: [
    "장기 연환산 수익률(실적배당 5y 5.37%/10y 4.48%, 원리금보장 5y 2.68%/10y 2.11%)을 시뮬레이션의 보수/적극 시나리오 기본 가정으로",
    "총비용부담률 0.407%를 연 수수료 drag로 차감 (현재 엔진은 수수료 미반영)",
    "20년 복리 사례(적극 4.3억 vs 보장 2.7억)를 결과 화면의 '운용방식 격차' 설득 지표로",
    "IRP 위험자산 70% 상한과 결합해 연금계좌 고배당ETF 배분 제약에 반영",
  ],
};

export default RETIREMENT_WHITEPAPER_2025;
