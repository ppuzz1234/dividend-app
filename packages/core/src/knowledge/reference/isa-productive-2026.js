/* ------------------------------------------------------------------ *
 *  레퍼런스 데이터 — 2026 생산적 금융 ISA 신설 정리
 *  출처: "'만능통장' ISA, 2026년 이렇게 달라집니다" (2026.01.22)
 *  수집일: 2026-07-11
 *
 *  ⚠ 엔진이 직접 import 하지 않는 "원천 자료"입니다.
 *     세제개편 발표 요약 기준 — 국민성장형 세부 혜택은 미확정(발표 예정).
 *     최종 법령·시행령에 따라 변경 가능. 세무 자문·투자 권유 아님.
 * ------------------------------------------------------------------ */
export const ISA_PRODUCTIVE_2026 = {
  source: "'만능통장' ISA, 2026년 이렇게 달라집니다",
  title: "2026 생산적 금융 ISA 신설 — 청년형 · 국민성장형",
  url: null, // 뉴스 아티클(원문 URL 미확보)
  publishedAt: "2026-01-22",
  collectedAt: "2026-07-11",
  disclaimer:
    "세제개편 발표 요약 기준. 국민성장형 세부 혜택은 미확정(정부 추후 공개). 최종 확정 법령·시행령에 따라 변경 가능.",

  /* ── ISA 기본 분류 (기존 제도 정리 — 프로파일 보강용) ── */
  classification: {
    byManagement: [
      { id: "trust", name: "신탁형", gist: "예적금 위주 안정 추구형 — 상품을 신탁으로 지시" },
      { id: "discretionary", name: "일임형", gist: "금융사에 운용을 일임" },
      { id: "brokerage", name: "중개형", gist: "가입자가 직접 상품을 골라 매매 — 가장 대중적" },
    ],
    byIncome: [
      { id: "seomin", name: "서민형", condition: "연 소득 5,000만원 이하", taxFreeProfit: 4_000_000 },
      { id: "general", name: "일반형", condition: "연 소득 5,000만원 초과", taxFreeProfit: 2_000_000 },
    ],
  },

  /* ── 기존 ISA 절세 구조 (기사 재확인 값) ── */
  existingIsa: {
    annualLimit: 20_000_000, // 연 2,000만
    totalLimit: 100_000_000, // 5년 최대 1억
    carryOver: true, // 미납 한도 이월 (예: 전년 500만 납입 → 당해 3,500만 가능)
    taxFreeProfit: { general: 2_000_000, seomin: 4_000_000 },
    excessRate: 0.099, // 비과세 초과분 9.9% 분리과세 (일반 15.4% 대비 저율)
    lossOffset: true, // 손익통산 (예: A +500만, B -250만 → 순이익 250만 중 초과 50만만 과세)
    minTermYears: 3, // 의무가입 3년 (계좌 최초 개설일 기준)
    critique:
      "연 납입 한도가 작고, 국내상장 해외 ETF 투자가 허용돼 세제혜택이 국내 기업으로 온전히 흘러가지 못한다는 지적 → 생산적 금융 ISA 신설 배경",
  },

  /* ── 신설: 생산적 금융 ISA ── */
  productiveIsa: {
    gist: "국내 자본시장으로 자금을 유도하기 위해 세제혜택을 대폭 강화한 신설 ISA",
    effectiveYear: 2026,
    investableProducts: [
      "국내 주식",
      "국내 주식형 펀드",
      "국민성장펀드",
      "기업성장집합투자기구(BDC)",
    ],
    excludedProducts: [
      "국내상장 해외주식형 ETF (나스닥·S&P500 등) — 투자 불가",
    ],
    purpose: "그동안 국내상장 해외 ETF로 빠지던 자금을 국내 증시로 유입",

    /* 기존 ISA와의 병행 규칙 */
    coexistence: {
      withExistingIsa: true, // 기존 ISA 보유자도 추가 개설 가능
      youthAndGrowthTogether: false, // 청년형·국민성장형 동시 개설 불가 (택1)
    },

    types: [
      {
        id: "youth",
        name: "청년형 ISA",
        eligibility: {
          age: "만 19~34세",
          incomeLimit: 75_000_000, // 연 소득 7,500만원 이하
        },
        benefit: {
          taxSpecial: "이자·배당소득 세금 특례",
          incomeDeduction: {
            rate: 0.1, // 납입금 10% 소득공제 (기사 예시)
            capExample: 2_000_000, // 연 2,000만 납입 × 10% → 최대 200만 소득공제
            note: "총급여 4,000만 직장인이 신용카드 2,300만 사용 시 받는 공제(약 195만)와 유사한 체감 혜택",
          },
        },
        exclusions: [
          "청년미래적금과 중복 가입 불가",
          "국민성장형 ISA와 동시 개설 불가",
        ],
      },
      {
        id: "nationalGrowth",
        name: "국민성장형 ISA",
        eligibility: {
          who: "청년형 대상이 아닌 그 밖의 국민",
        },
        benefit: {
          incomeDeduction: null, // 소득공제 없음
          expected: "비과세 한도 상향 또는 분리과세율 인하 등 기존 ISA 대비 세제혜택 대폭 확대",
          status: "미확정 — 세부 내용 추후 공개 예정",
        },
        exclusions: ["청년형 ISA와 동시 개설 불가"],
      },
    ],
  },

  /* ── 실무 팁 (기사 발췌) ── */
  tips: [
    {
      title: "일단 계좌부터 개설",
      body:
        "세제혜택 조건인 의무가입 3년은 '계좌 최초 개설일'부터 카운트. 지금 납입할 돈이 없어도 계좌를 먼저 만들어 두면 훗날 납입 시에도 3년 기산점을 앞당겨 혜택을 앞당길 수 있음.",
    },
  ],

  /* ── 엔진 승격 현황 ──
     ✅ 승격 완료 / ⏳ 미확정·보류 */
  engineCandidates: [
    "✅ 청년형 납입금 10% 소득공제(최대 200만)·자격(만 19~34세·연소득 7,500만 이하) → accounts.js ISA.productiveYouth 파라미터 + optimizer.allocate 소득공제액 산출(estIsaYouthDeduction)로 반영",
    "⏳ 국내상장 해외 ETF 편입 불가 → productEligibility 신규 계좌 컬럼: 상품범위 미확정(리츠·채권형 등)이라 추측 방지 위해 보류, 레퍼런스로만 보관",
    "⏳ 청년미래적금 중복 제한 → 서베이 자격 판별 로직 확장 시 반영",
    "⏳ 국민성장형 세부 혜택(비과세 한도·분리과세율) 확정 시 accountProfiles ISA 서브타입·엔진 파라미터로 승격",
  ],
};

export default ISA_PRODUCTIVE_2026;
