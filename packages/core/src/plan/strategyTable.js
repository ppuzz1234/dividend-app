import { MYDATA_ACCOUNTS } from "../holdings/snapshot.js";
import { buildRebalance } from "../rebalance/rebalance.js";

/* ------------------------------------------------------------------ *
 *  전략 비교표 — "현재"(마이데이터 취합) vs "제안"(리밸런싱 로직 적용)
 *  ──────────────────────────────────────────────────────────────
 *  계좌 열(증권/ISA/연금)마다 상품 구분별 금액을 취합하고,
 *  연 배당 가정으로 세금·건강보험료·세금총액을 추정한다.
 *  "제안" 시나리오는 rebalance 모듈의 이동 제안을 그대로 적용해 만든다.
 *  ⚠ 단순화 가정치 — 실제 과세·건보료 산정과 다를 수 있음 (자문 아님)
 * ------------------------------------------------------------------ */

/* 상품 유형(productEligibility id) → 표에 쓰는 구분 라벨 */
export const PRODUCT_GROUP_LABELS = {
  krStock: "국내 개별주식",
  krEtf: "국내 ETF",
  krReit: "국내 리츠",
  bondFund: "채권형 펀드",
  equityFund: "주식형 펀드",
  foreignStock: "해외상장 주식",
  foreignEtf: "해외상장 ETF",
  krListedGlobalEtf: "국내상장 해외ETF",
  realEstateFund: "부동산펀드",
  elsDls: "ELS/DLS",
  deposit: "예금",
};

/* 계좌 열 정의 + 정성 정보 (첨부 표의 장점/단점/활용 행) */
const COLUMNS = [
  {
    id: "general",
    name: "증권계좌 (일반)",
    taxNote: "배당소득세 15.4% (금융소득 2천만 초과 시 종합과세) · 해외상장 매매차익 양도세 22%",
    pros: "해외 주식 직접 투자 · 언제든지 해지 가능",
    cons: "금융소득 2천만원 초과 시 종합과세 대상",
    use: "단기 목표 · 여유자금 (해외여행 등)",
  },
  {
    id: "isa",
    name: "ISA 계좌",
    taxNote: "분리과세 (순이익 200만원 비과세, 초과분 9.9%)",
    pros: "중기 목표 가능 · 종합소득 과세 미대상",
    cons: "비과세 금액 낮음 · 3년 의무가입",
    use: "중기 목표 3년 이상 (결혼, 아파트 등)",
  },
  {
    id: "pension",
    name: "연금계좌 (연금저축·IRP)",
    taxNote: "적립 중 과세이연 · 수령 시 연금소득세 5.5~3.3%",
    pros: "과세 이연 · 납입 시 세액공제",
    cons: "연금 이외 수령 시 16.5% 세금 납부",
    use: "장기 목표 (은퇴 준비)",
  },
];

/* 기본 가정치 */
const DEFAULTS = {
  divYield: 0.035, // 연 배당수익률 가정
  healthRate: 0.0801, // 건강보험료율(지역가입 소득 반영 단순화) — 일반계좌 배당에만 적용
};

/* 해외상장 상품 — 수익을 매도차익(양도세 22%, 연 250만 공제)으로 과세, 건보 미부과 */
const TRANSFER_TYPES = new Set(["foreignStock", "foreignEtf"]);

/* 한 계좌의 보유 목록 → 상품 구분별 취합 + 과세 클래스별 합계 */
function groupProducts(holdings = []) {
  const acc = new Map();
  let dividendBase = 0;
  let transferBase = 0;
  for (const h of holdings) {
    const label = PRODUCT_GROUP_LABELS[h.productType] || h.productType;
    acc.set(label, (acc.get(label) || 0) + (h.value || 0));
    if (TRANSFER_TYPES.has(h.productType)) transferBase += h.value || 0;
    else dividendBase += h.value || 0;
  }
  return { products: [...acc.entries()].map(([label, value]) => ({ label, value })), dividendBase, transferBase };
}

/* 계좌별 연간 세금·건보료 추정 (단순 모델 — 백엔드 provider와 동일 규칙) */
function estimateTax(accountId, { dividendBase, transferBase }, { divYield, healthRate }) {
  const dividend = dividendBase * divYield;
  if (accountId === "general") {
    const gain = transferBase * divYield; // 해외상장 연 수익(차익 실현 가정)
    const divTax = dividend * 0.154;
    const transferTax = Math.max(0, gain - 2_500_000) * 0.22;
    const health = dividend * healthRate; // 양도차익은 건보 미부과
    const taxBreakdown = [
      transferBase > 0 && { label: "양도소득세 (연 250만 공제 후 22%)", amount: transferTax },
      dividendBase > 0 && { label: "배당소득세 (15.4%)", amount: divTax },
    ].filter(Boolean);
    return { dividend, gain, tax: divTax + transferTax, health, totalTax: divTax + transferTax + health, taxBreakdown };
  }
  if (accountId === "isa") {
    const tax = Math.max(0, dividend - 2_000_000) * 0.099; // 순이익 200만 비과세 후 9.9%
    return { dividend, tax, health: 0, totalTax: tax };
  }
  // pension: 과세이연 — 수령 시 연금소득세(55~70세 5.5% 가정)
  const tax = dividend * 0.055;
  return { dividend, tax, health: 0, totalTax: tax, deferred: true };
}

/* 스냅샷 → 표 한 벌(시나리오) */
function scenarioTable(snapshot, opts) {
  const columns = COLUMNS.map((c) => {
    const holdings = snapshot[c.id]?.holdings || [];
    const { products, dividendBase, transferBase } = groupProducts(holdings);
    const totalValue = products.reduce((s, p) => s + p.value, 0);
    const est = estimateTax(c.id, { dividendBase, transferBase }, opts);
    return { ...c, products, totalValue, ...est };
  });
  return { columns, totalTax: columns.reduce((s, c) => s + c.totalTax, 0) };
}

/* 리밸런싱 제안을 적용한 스냅샷 생성 (제안 시나리오) */
function applyProposals(snapshot) {
  const { proposals } = buildRebalance(snapshot);
  const next = Object.fromEntries(
    Object.entries(snapshot).map(([id, a]) => [id, { ...a, holdings: [...(a.holdings || [])] }])
  );
  const moves = [];
  for (const p of proposals) {
    const from = next[p.from.id];
    const i = from.holdings.findIndex((h) => h.name === p.holding.name);
    if (i < 0) continue;
    const [h] = from.holdings.splice(i, 1);
    (next[p.to.id] ||= { holdings: [] }).holdings.push(h);
    moves.push({
      label: PRODUCT_GROUP_LABELS[h.productType] || h.productType,
      name: h.name,
      value: h.value,
      from: p.from.name,
      to: p.to.name,
      gainNote: p.gainNote,
    });
  }
  return { snapshot: next, moves };
}

/**
 * 현재(마이데이터 취합) vs 제안(리밸런싱 적용) 비교표.
 * @returns {{ current, proposed, moves, savings, assumptions }}
 */
export function buildStrategyComparison({ snapshot = MYDATA_ACCOUNTS, ...overrides } = {}) {
  const opts = { ...DEFAULTS, ...overrides };
  const current = scenarioTable(snapshot, opts);
  const applied = applyProposals(snapshot);
  const proposed = scenarioTable(applied.snapshot, opts);
  return {
    current,
    proposed,
    moves: applied.moves,
    savings: Math.max(0, current.totalTax - proposed.totalTax), // 연간 세금·건보료 절감 추정
    assumptions: opts,
  };
}

export default buildStrategyComparison;
