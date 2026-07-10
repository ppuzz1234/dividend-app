/* ================================================================== *
 *  계좌 × 상품 편입 가능 매트릭스 (내부 지식 베이스)
 *  ──────────────────────────────────────────────────────────────
 *  4개 계좌(일반·ISA·연금저축·IRP)가 담을 수 있는 상품 구분표.
 *  "보유 상품 운용 계좌 조정" 단계가 이 매트릭스를 읽어
 *  상품을 어느 계좌로 옮길 수/없을지 판단한다.
 *
 *  status: "ok"(가능) | "no"(불가) | "cond"(조건부 — note 필수)
 *
 *  법적 근거(2026-07 기준):
 *  · ISA        : 조세특례제한법 §91-18 — 편입상품은 유형별 상이
 *                 (중개형=주식·ETF·채권·리츠·펀드, 신탁형=예금·펀드·ELS,
 *                  일임형=금융사 모델포트폴리오). 주식 직접매매는 중개형만.
 *  · 연금저축   : 소득세법 시행령 §40-2 연금계좌 — 운용은 집합투자증권
 *                 (펀드·ETF·상장리츠) 중심, 개별주식·파생결합증권 불가.
 *                 상장리츠는 금융위 2022-10-07 발표로 편입 허용.
 *  · IRP        : 근로자퇴직급여보장법 + 퇴직연금감독규정 — 위험자산
 *                 총 70% 한도(안전자산 ≥30%), 개별주식·레버리지/인버스 불가,
 *                 비보장 ELS는 최대손실 원금 40% 이내 상품만.
 *  ⚠ 감독규정·증권사 취급 범위는 수시 개정 — 세무/법률 자문 아님.
 * ================================================================== */

export const ELIGIBILITY_VERSION = "2026.07";

/* 컬럼 순서 — accountProfiles.js 의 id 체계와 동일 */
export const ELIGIBILITY_ACCOUNTS = ["general", "isa", "pensionSavings", "irp"];

const ok = (note) => ({ status: "ok", ...(note ? { note } : {}) });
const no = (note) => ({ status: "no", ...(note ? { note } : {}) });
const cond = (note) => ({ status: "cond", note });

export const PRODUCT_ELIGIBILITY = [
  {
    id: "krStock",
    label: "국내 개별주식 (코스피/코스닥)",
    general: ok(),
    isa: cond("중개형 ISA만 가능 — 신탁형·일임형은 주식 직접매매 불가"),
    pensionSavings: no("연금계좌는 개별주식 매매 자체가 불가 (집합투자증권 중심)"),
    irp: no("퇴직연금감독규정상 상장주식 직접투자 불가"),
    basis: "ISA는 유형별 편입상품이 달라 '중개형만' 조건 필수",
  },
  {
    id: "krEtf",
    label: "국내상장 ETF",
    general: ok(),
    isa: ok("중개형 기준. 레버리지·인버스는 파생상품 교육 이수 후 가능"),
    pensionSavings: cond("일반 ETF 가능 — 레버리지·인버스 ETF는 불가"),
    irp: cond("일반 ETF 가능 — 레버리지·인버스 불가, 위험자산 70% 한도 적용"),
    basis: "전 계좌 편입 가능하되 연금계좌는 레버리지·인버스 금지",
  },
  {
    id: "krReit",
    label: "국내상장 리츠(REITs)",
    general: ok(),
    isa: ok("중개형·신탁형 편입 가능"),
    pensionSavings: ok("2022-10부터 공모 상장리츠 편입 허용 (금융위)"),
    irp: cond("가능 — 위험자산 70% 한도 적용 (2019~ 허용)"),
    basis: "연금저축 리츠는 2022-10 금융위 '연금저축펀드 투자대상 확대'로 허용 확인",
  },
  {
    id: "bondFund",
    label: "국내 채권형 펀드",
    general: ok(),
    isa: ok(),
    pensionSavings: ok(),
    irp: ok("채권형·채권혼합형(주식 40% 이하)은 안전자산 30% 요건 충족 수단으로 인정"),
    basis: "전 계좌 편입 가능. IRP에서는 안전자산 분류라는 이점까지 있음",
  },
  {
    id: "equityFund",
    label: "국내 주식형 펀드",
    general: ok(),
    isa: ok(),
    pensionSavings: ok(),
    irp: cond("가능 — 위험자산 70% 한도 적용"),
    basis: "IRP만 위험자산 편입비율 규제",
  },
  {
    id: "foreignStock",
    label: "해외상장 개별주식 (예: AAPL)",
    general: ok("양도차익 22% (연 250만 기본공제), 배당 15.4%"),
    isa: no(),
    pensionSavings: no(),
    irp: no(),
    basis: "절세계좌 3종은 국내상장 상품만 편입 가능",
  },
  {
    id: "foreignEtf",
    label: "해외상장 ETF (예: SPY)",
    general: ok("과세는 해외주식과 동일 (양도세 22%)"),
    isa: no(),
    pensionSavings: no(),
    irp: no(),
    basis: "해외상장 개별주식과 동일 룰",
  },
  {
    id: "krListedGlobalEtf",
    label: "국내상장 해외ETF (예: TIGER 미국S&P500)",
    general: ok("매매차익이 배당소득 15.4%로 과세(보유기간과세) — 해외상장의 양도세 22%와 다르고, 금융소득종합과세 합산 대상"),
    isa: ok("손익통산 + 비과세 한도 적용 — 국내상장 해외ETF의 최적 보관처 중 하나"),
    pensionSavings: ok("과세이연 — 매매차익·분배금 모두 인출 시점 과세"),
    irp: cond("가능 — 위험자산 70% 한도 적용"),
    basis: "'국내상장'이라 전 계좌 편입 가능. 일반계좌 과세는 양도세가 아닌 배당소득 과세임에 유의",
  },
  {
    id: "elsDls",
    label: "ELS/DLS (파생결합증권)",
    general: ok(),
    isa: cond("신탁형·중개형에서 편입 가능 — 유형·증권사별 취급 차이 있어 실무 확인"),
    pensionSavings: no("연금저축펀드는 파생결합증권 편입 불가"),
    irp: cond("원리금보장형(ELB)은 안전자산으로 제한 없이 가능. 비보장 ELS는 최대손실이 원금의 40% 이내인 상품만 위험자산으로 편입 가능"),
    basis: "IRP는 '원리금보장형 제외'가 아니라 반대 — 보장형(ELB)이 자유롭고 비보장형에 손실률 조건이 붙음",
  },
  {
    id: "realEstateFund",
    label: "리츠 외 부동산펀드 (공모)",
    general: ok(),
    isa: ok(),
    pensionSavings: ok(),
    irp: cond("가능 — 위험자산 70% 한도 적용"),
    basis: "공모 부동산펀드는 집합투자증권이라 펀드와 동일 룰",
  },
  {
    /* 사용자 표에는 없던 행 — 안전자산 30% 로직에 필요해 추가 */
    id: "deposit",
    label: "예·적금 (원리금보장)",
    general: no("위탁계좌에는 예금 편입 불가 — RP·발행어음·CMA로 대체"),
    isa: cond("신탁형만 예금 편입 가능 — 중개형은 RP·발행어음으로 대체"),
    pensionSavings: no("연금저축펀드는 원리금보장상품 미취급 (연금저축보험·신탁과 구분)"),
    irp: ok("정기예금 등 원리금보장상품 편입 가능 — 안전자산 30% 충족의 대표 수단"),
    basis: "IRP만 예금을 담을 수 있다는 점이 계좌 조정 단계의 핵심 차별 요소",
  },
];

/* ------------------------------------------------------------------ *
 *  조회 헬퍼
 * ------------------------------------------------------------------ */

/** 특정 상품을 담을 수 있는 계좌 id 목록 (조건부 포함 여부 선택) */
export function eligibleAccountsFor(productId, { includeConditional = true } = {}) {
  const row = PRODUCT_ELIGIBILITY.find((p) => p.id === productId);
  if (!row) return [];
  return ELIGIBILITY_ACCOUNTS.filter((acc) => {
    const cell = row[acc];
    return cell.status === "ok" || (includeConditional && cell.status === "cond");
  });
}

/** 특정 계좌가 담을 수 있는 상품 행 목록 */
export function productsForAccount(accountId, { includeConditional = true } = {}) {
  return PRODUCT_ELIGIBILITY.filter((p) => {
    const cell = p[accountId];
    return cell && (cell.status === "ok" || (includeConditional && cell.status === "cond"));
  });
}
