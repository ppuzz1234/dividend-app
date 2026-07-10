/* ================================================================== *
 *  계좌 유형별 지식 베이스 (내부 로직 참조 영역)
 *  ──────────────────────────────────────────────────────────────
 *  ISA · 연금저축 · IRP · 일반계좌의 속성/세제혜택/제약/장점을 구조화.
 *  새 플로우(투자성향 서베이 → 보유계좌 분석 → 운용계좌 조정 →
 *  불입금 기반 올해 투자방향)의 각 단계가 이 프로파일을 읽는다.
 *
 *  · data/accounts.js 의 ACCOUNTS 는 엔진용 "수치 파라미터"(과세율·한도),
 *    이 파일은 판단·설명용 "프로파일". 수치가 겹치는 항목은 값을 일치시킬 것.
 *  · 출처: data/reference/* 수집 자료 (sources 필드에 표기)
 *  · 한도·세율은 매년 개정 — effectiveYear 기준. 세무 자문·투자 권유 아님.
 * ================================================================== */

export const PROFILE_VERSION = "2026.07";

export const ACCOUNT_PROFILES = {
  /* ───────────────────────── ISA (개인종합자산관리계좌) ───────────── */
  isa: {
    id: "isa",
    name: "ISA",
    fullName: "개인종합자산관리계좌",
    effectiveYear: 2026,
    overview: "하나의 계좌에서 예금·펀드·ETF·주식을 굴리며 순이익에 비과세·분리과세를 받는 만능 절세 계좌",

    eligibility: {
      who: "만 19세 이상 거주자 (근로소득 있으면 15세 이상)",
      restriction: "직전 3개년 금융소득종합과세 대상자는 가입 불가",
      oneAccountOnly: true, // 전 금융기관 통틀어 1인 1계좌
    },

    contribution: {
      annualLimit: 20_000_000, // 연 2,000만원
      totalLimit: 100_000_000, // 누적 1억원
      carryOver: true, // 미납 한도 이월 가능
      note: "당해 안 쓴 한도는 다음 해로 이월 (예: 1년차 미납 시 2년차 4,000만 납입 가능)",
    },

    taxBenefit: {
      type: "비과세 + 분리과세",
      taxFreeProfit: 2_000_000, // 일반형: 만기 시 순이익 200만 비과세
      taxFreeProfitSeomin: 4_000_000, // 서민형(총급여 5천만 이하 등): 400만
      excessRate: 0.099, // 비과세 한도 초과 이익 9.9% 분리과세
      lossOffset: true, // 계좌 내 손익통산 — 손실 상품과 이익 상품 상계 후 순이익에만 과세
      deferred: true, // 만기 시점 일괄 과세 (보유 중 배당·매매차익 과세 이연)
    },

    constraints: {
      minTermYears: 3, // 의무가입 3년
      withdrawal: "납입원금 한도 내 중도인출 가능 (혜택 유지) — 원금 초과 인출은 해지로 간주",
      products: "국내상장 주식·ETF·펀드·리츠·예적금 (해외상장 주식 직접투자 불가)",
      renewable: true, // 만기 후 재가입·연장 가능
    },

    pros: [
      "배당·이자 손익통산 후 200만(서민형 400만)까지 비과세, 초과분도 9.9% 저율 분리과세",
      "ISA 내 금융소득은 금융소득종합과세(연 2,000만) 산정에서 제외",
      "3년만 채우면 되고 원금 내 중도인출도 가능해 연금계좌보다 유동성 좋음",
      "만기자금을 연금계좌로 이전하면 이전액 10%(최대 300만) 추가 세액공제",
    ],
    cons: [
      "납입 단계 세액공제는 없음 (혜택은 인출·만기 시점)",
      "해외상장 주식·ETF 직접투자 불가 (국내상장 해외지수 ETF로 대체)",
      "금융소득종합과세 대상자는 가입 자체가 막힘",
    ],

    synergy: [
      {
        with: "pensionSavings|irp",
        rule: "만기자금을 60일 내 연금계좌로 이전 시 이전액의 10%(최대 300만원) 일회성 추가 세액공제",
        source: "irp-samsung",
      },
    ],

    /* 서베이(성향) 단계 매칭용 태그 */
    fitFor: {
      horizon: "mid", // 3년+ 중기
      liquidityNeed: "mid",
      taxSensitivity: "high",
      goals: ["cashflow", "retirement", "lumpsum"],
    },

    sources: ["pension-letter-89", "irp-samsung"],
  },

  /* ───────────────────────── 연금저축 (연금저축펀드) ─────────────── */
  pensionSavings: {
    id: "pensionSavings",
    name: "연금저축",
    fullName: "연금저축펀드",
    effectiveYear: 2026,
    overview: "납입 즉시 세액공제를 받고 과세이연 상태로 55세까지 굴리는 개인연금 계좌. 연금계좌 중 운용·인출 자유도가 가장 높음",

    eligibility: {
      who: "누구나 (소득·나이 제한 없음 — 무소득자·주부·미성년자도 가입 가능)",
      restriction: null,
      oneAccountOnly: false, // 복수 계좌 개설 가능
    },

    contribution: {
      annualLimit: 18_000_000, // 연금계좌(연금저축+IRP) 합산 연 1,800만
      combinedWithIrp: true,
      deductCap: 6_000_000, // 연금저축 단독 세액공제 한도 600만 (IRP 합산 시 900만)
      note: "세액공제 한도(600만) 초과 납입분은 공제는 없지만 과세이연·저율과세 혜택은 동일",
    },

    taxBenefit: {
      type: "세액공제 + 과세이연 + 연금소득세 저율과세",
      deductionRates: [
        { maxTotalSalary: 55_000_000, rate: 0.165 }, // 총급여 5,500만 이하 16.5%
        { maxTotalSalary: Infinity, rate: 0.132 }, // 초과 13.2%
      ],
      maxRefund: 990_000, // 600만 × 16.5%
      deferred: true, // 배당·매매차익 과세이연 → 재투자 복리
      pensionIncomeTax: [
        { minAge: 55, maxAge: 70, rate: 0.055 },
        { minAge: 70, maxAge: 80, rate: 0.044 },
        { minAge: 80, maxAge: Infinity, rate: 0.033 },
      ],
    },

    constraints: {
      lockAge: 55, // 만 55세 + 가입 5년 후 연금 개시
      minJoinYears: 5,
      earlyWithdrawalTax: 0.165, // 세액공제분+수익 중도인출 시 기타소득세 16.5%
      partialWithdrawal: "가능 — 세액공제 안 받은 원금은 페널티 없이 자유 인출 (IRP와 결정적 차이)",
      products: "ETF·펀드 (개별 주식 불가, 레버리지/인버스 불가)",
      riskAssetCap: null, // 위험자산 100% 가능 (IRP와 달리 안전자산 의무 없음)
      annualPensionThreshold: 15_000_000, // 연 수령 1,500만 초과 시 종합과세 or 16.5% 분리과세 선택
    },

    pros: [
      "납입 즉시 최대 16.5% 세액공제 — 확정 수익률처럼 작동",
      "위험자산 100% 운용 가능 (IRP의 70% 제한 없음)",
      "세액공제 안 받은 원금은 언제든 페널티 없이 인출 가능",
      "가입 자격 제한이 없어 무소득 배우자·자녀 명의 절세 설계 가능",
      "연금 수령 시 3.3~5.5% 저율 과세 + 수령 연차 오래 쌓을수록 유리",
    ],
    cons: [
      "세액공제 받은 금액과 수익은 55세까지 사실상 잠김 (중도인출 시 16.5%)",
      "개별 주식 직접투자 불가",
      "연 1,500만 초과 수령 시 종합과세 부담 — 수령 계획 설계 필요",
    ],

    synergy: [
      {
        with: "irp",
        rule: "세액공제는 연금저축 600만 먼저 채우고 나머지 300만을 IRP에 — 유동성·운용 자유도가 연금저축이 우위",
        source: "irp-samsung",
      },
      {
        with: "isa",
        rule: "ISA 만기자금 이전 받는 대상 계좌가 될 수 있음 (이전액 10% 추가 공제)",
        source: "irp-samsung",
      },
    ],

    fitFor: {
      horizon: "long", // 55세까지 초장기
      liquidityNeed: "low",
      taxSensitivity: "high",
      goals: ["retirement"],
    },

    sources: ["irp-samsung", "pension-letter-89"],
  },

  /* ───────────────────────── IRP (개인형 퇴직연금) ───────────────── */
  irp: {
    id: "irp",
    name: "IRP",
    fullName: "개인형 퇴직연금",
    effectiveYear: 2026,
    overview: "퇴직금 수령 + 추가 납입으로 세액공제를 받는 퇴직연금 계좌. 공제 한도는 크지만 운용·인출 제약이 가장 강함",

    eligibility: {
      who: "소득 증빙 가능한 경제활동 인구 (근로자·자영업자·공무원 등)",
      restriction: "무소득자는 가입 불가 (연금저축과의 차이)",
      oneAccountOnly: false,
    },

    contribution: {
      annualLimit: 18_000_000, // 연금계좌 합산 연 1,800만
      combinedWithPensionSavings: true,
      deductCap: 9_000_000, // IRP 단독으로도 900만까지 세액공제 가능 (연금저축과 합산 한도)
      note: "연금저축 600만을 먼저 채웠다면 IRP에는 300만까지가 공제 실효분",
    },

    taxBenefit: {
      type: "세액공제 + 과세이연 + 퇴직소득세 감면",
      deductionRates: [
        { maxTotalSalary: 55_000_000, rate: 0.165 },
        { maxTotalSalary: Infinity, rate: 0.132 },
      ],
      maxRefund: 1_485_000, // 900만 × 16.5%
      deferred: true,
      pensionIncomeTax: [
        { minAge: 55, maxAge: 70, rate: 0.055 },
        { minAge: 70, maxAge: 80, rate: 0.044 },
        { minAge: 80, maxAge: Infinity, rate: 0.033 },
      ],
      retirementTaxReduction: [
        // 퇴직금을 연금으로 수령 시 퇴직소득세 감면 (수령 연차별, 2026~ 20년 초과 구간 신설)
        { yearFrom: 1, yearTo: 10, reduction: 0.3 },
        { yearFrom: 11, yearTo: 20, reduction: 0.4 },
        { yearFrom: 21, yearTo: Infinity, reduction: 0.5 },
      ],
    },

    constraints: {
      lockAge: 55,
      minJoinYears: 5, // 퇴직금 이체 계좌는 가입기간 무관
      earlyWithdrawalTax: 0.165,
      partialWithdrawal: "원칙 불가 — 법정 사유(요양·파산·천재지변 등) 외에는 전액 해지해야 함",
      products: "ETF·펀드·예금·리츠 (개별 주식 불가, 레버리지/인버스 불가)",
      riskAssetCap: 0.7, // 위험자산 최대 70% — 안전자산 30% 의무
      feeRate: 0.0031, // 총비용부담률 0.311% (퇴직연금 백서 2025) — 사업자별 상이, 온라인 면제 상품 존재
      annualPensionThreshold: 15_000_000,
    },

    pros: [
      "세액공제 한도가 가장 큼 (단독 900만, 최대 148.5만 환급)",
      "퇴직금을 이체 받아 퇴직소득세 이연 + 연금 수령 시 30~50% 감면",
      "예금 등 원리금보장상품도 편입 가능해 안전자산 운용 겸용",
    ],
    cons: [
      "위험자산 70% 제한 — 배당·성장 ETF를 100% 채울 수 없음",
      "부분인출 원칙 불가 — 급전 필요 시 계좌 전체 해지 (기타소득세 16.5%)",
      "계좌 관리 수수료 존재 (연금저축펀드는 대부분 무료)",
      "무소득자는 가입 불가",
    ],

    synergy: [
      {
        with: "pensionSavings",
        rule: "공제 우선순위는 연금저축(600만) → IRP(300만). 여유가 더 있으면 IRP 추가 납입",
        source: "irp-samsung",
      },
      {
        with: "isa",
        rule: "ISA 만기자금 60일 내 이전 시 이전액 10%(최대 300만) 추가 세액공제",
        source: "irp-samsung",
      },
    ],

    fitFor: {
      horizon: "long",
      liquidityNeed: "low",
      taxSensitivity: "high",
      goals: ["retirement"],
    },

    sources: ["irp-samsung", "retirement-whitepaper-2025", "pension-letter-89"],
  },

  /* ───────────────────────── 일반 위탁계좌 ───────────────────────── */
  general: {
    id: "general",
    name: "일반 위탁계좌",
    fullName: "일반 증권 위탁계좌",
    effectiveYear: 2026,
    overview: "한도·기간·상품 제약이 전혀 없는 기본 계좌. 세제혜택 대신 완전한 유동성",

    eligibility: { who: "누구나", restriction: null, oneAccountOnly: false },

    contribution: { annualLimit: Infinity, deductCap: 0 },

    taxBenefit: {
      type: "없음",
      dividendTax: 0.154, // 배당소득세 15.4% 원천징수
      note: "국내주식 매매차익 비과세(대주주 제외), 해외주식 양도차익 22%(연 250만 공제)",
    },

    constraints: {
      lockAge: null,
      compTaxThreshold: 20_000_000, // 연 금융소득 2,000만 초과 시 종합과세 (배당가산율 2027~ 11%)
      products: "제한 없음 — 국내외 개별주식·ETF·레버리지 모두 가능",
    },

    pros: [
      "언제든 입출금 — 유동성 최고",
      "해외 상장 주식·ETF 직접투자 등 상품 제약 없음",
      "한도 없음 — 절세계좌를 다 채운 뒤 초과 자금의 종착지",
    ],
    cons: [
      "배당마다 15.4% 원천징수 — 복리 효율 저하",
      "금융소득 연 2,000만 초과 시 종합과세 (최고 49.5%)",
      "해외주식 비중 크면 국외전출세 확대(2027~) 등 제도 리스크 체크 필요",
    ],

    synergy: [
      {
        with: "isa|pensionSavings|irp",
        rule: "절세계좌 한도를 모두 채운 뒤의 초과 자금 전용 — 고배당보다 배당성장·저배당 성장주가 세효율적",
        source: "pension-letter-89",
      },
    ],

    fitFor: {
      horizon: "any",
      liquidityNeed: "high",
      taxSensitivity: "low",
      goals: ["cashflow", "lumpsum", "retirement"],
    },

    sources: ["pension-letter-89"],
  },
};

/* ------------------------------------------------------------------ *
 *  올해 불입 우선순위 기본 룰 (4단계 "투자 방향 수립"의 시드 로직)
 *  성향(서베이 결과)·목표에 따라 순서가 조정될 수 있는 기본값.
 * ------------------------------------------------------------------ */
export const CONTRIBUTION_PRIORITY = [
  { accountId: "pensionSavings", upTo: 6_000_000, why: "세액공제 최대 16.5% — 확정 수익 성격, 운용 자유도도 IRP보다 높음" },
  { accountId: "irp", upTo: 3_000_000, why: "합산 공제 한도 900만까지 마저 채움 (연금저축 600만 이후)" },
  { accountId: "isa", upTo: 20_000_000, why: "비과세·손익통산 + 3년 뒤 연금 전환 보너스, 중기 유동성 확보" },
  { accountId: "pensionSavings", upTo: 18_000_000, why: "공제는 없지만 과세이연 혜택 지속 (연금계좌 합산 한도까지)", label: "공제초과 납입" },
  { accountId: "general", upTo: Infinity, why: "모든 절세 한도 소진 후 초과 자금" },
];

/* ------------------------------------------------------------------ *
 *  기존 엔진(data/accounts.js ACCOUNTS) id 와의 매핑
 *  엔진이 연금저축·IRP를 "pension" 하나로 다루는 동안의 브리지.
 *  플로우 고도화로 엔진이 분리 대응하게 되면 제거한다.
 * ------------------------------------------------------------------ */
export const ENGINE_ACCOUNT_MAP = {
  isa: "isa",
  pensionSavings: "pension",
  irp: "pension",
  general: "general",
};

export function profilesForEngineId(engineId) {
  return Object.values(ACCOUNT_PROFILES).filter((p) => ENGINE_ACCOUNT_MAP[p.id] === engineId);
}
