import {
  findAccounts,
  findProducts,
  findIsaRollover,
  findHorizonById,
  findSampleSnapshot,
  tableVersions,
} from "./repository.js";

/* ------------------------------------------------------------------ *
 *  P — Provider: 전략 비즈니스 로직
 *  사용자 입력(성향 horizon·월 불입·전년도 금융/총소득·마이데이터 스냅샷)을
 *  받아 4개 테이블(계좌 특성·운용 상품·ISA 롤오버·운용기간) 기반으로
 *  ① 계좌별 여력 ② 현재 vs 제안 비교표 ③ 월 불입 배분안을 산출한다.
 *  ⚠ 단순화 가정 모델 — 세무 자문 아님
 * ------------------------------------------------------------------ */

const DEFAULTS = {
  divYield: 0.035, // 연 배당수익률 가정
  healthRate: 0.0801, // 건강보험료율 (일반계좌 배당 반영 단순화)
};

/* 종합소득세 한계세율 (지방소득세 10% 포함, 과세표준≈총소득 근사) */
const COMP_TAX_THRESHOLD = 20_000_000; // 금융소득종합과세 기준
const TAX_BRACKETS = [
  { upTo: 14_000_000, rate: 0.066 },
  { upTo: 50_000_000, rate: 0.165 },
  { upTo: 88_000_000, rate: 0.264 },
  { upTo: 150_000_000, rate: 0.385 },
  { upTo: 300_000_000, rate: 0.418 },
  { upTo: 500_000_000, rate: 0.44 },
  { upTo: 1_000_000_000, rate: 0.462 },
  { upTo: Infinity, rate: 0.495 },
];
const marginalRate = (income) => TAX_BRACKETS.find((b) => income <= b.upTo).rate;

const ENGINE_TAX_RANK = { pension: 0, isa: 1, general: 2 }; // 낮을수록 절세 유리

/* ── 유틸 ── */
const floorTo = (v, unit) => Math.floor(v / unit) * unit;
const cloneSnapshot = (s) =>
  Object.fromEntries(
    Object.entries(s).map(([id, a]) => [id, { ...a, holdings: (a.holdings || []).map((h) => ({ ...h })) }])
  );

/* ── ① 계좌별 여력 (연 한도 · 올해 납입 · 남은 여력) ── */
function buildRooms(accounts, snapshot, { totalIncome, isaJoinBlocked, hasIsa }) {
  const refundRate = totalIncome <= 55_000_000 ? 0.165 : 0.132;
  const pensionContributed = snapshot.pension?.contributedThisYear || 0;
  const usedBy = {
    general: 0,
    isa: snapshot.isa?.contributedThisYear || 0,
    pensionSavings: Math.min(pensionContributed, 6_000_000),
    irp: Math.max(0, pensionContributed - 6_000_000),
  };

  return accounts.map((a) => {
    const snap = snapshot[a.engineId];
    const held = a.id === "irp" ? false : !!snap;
    const limit = a.deductCap > 0 ? a.deductCap : a.annualLimit;
    const used = usedBy[a.id] || 0;
    const room = limit == null ? null : Math.max(0, limit - used);
    return {
      id: a.id,
      name: a.name,
      institution: held ? snap?.institution || null : null,
      held,
      balance: held ? snap?.balance || 0 : 0,
      roomType: a.deductCap > 0 ? "deduct" : limit == null ? "none" : "limit",
      limit,
      used,
      room,
      pct: limit ? Math.min(100, (used / limit) * 100) : 0,
      estRefund: a.deductCap > 0 ? Math.round((room || 0) * refundRate) : 0,
      blocked:
        a.id === "isa" && isaJoinBlocked
          ? hasIsa
            ? "금융소득종합과세 대상 — 기존 계좌 납입은 가능, 만기 후 재가입 제한 유의"
            : "금융소득종합과세 대상 — ISA 신규 가입 제한"
          : null,
    };
  });
}

/* 해외상장(foreignTransfer) 양도소득세 — 연 250만 공제 후 22%, 분류과세(건보 미부과) */
const TRANSFER_DEDUCTION = 2_500_000;
const TRANSFER_RATE = 0.22;

/* ── 계좌 열 하나의 세금 추정 (연간 모델) ──
 * 상품 과세 구분(taxClass) 반영:
 *  · foreignTransfer(해외상장) — 수익을 매도차익 실현으로 가정 → 양도세 22%
 *    (연 250만 공제), 분류과세라 금융소득종합과세·건보료와 무관
 *  · 그 외(배당소득) — 기존 금융소득(finIncome)이 종합과세 기준(2,000만)을
 *    소진한 만큼 한계세율로 과세 + 건보료 반영 */
function estimateTax(engineId, { dividendBase, transferBase }, isaRule, accountsByEngine, opts) {
  const dividend = dividendBase * opts.divYield;
  if (engineId === "general") {
    const acc = accountsByEngine.general;
    const gain = transferBase * opts.divYield; // 해외상장 연 수익(차익 실현 가정)
    const room = Math.max(0, COMP_TAX_THRESHOLD - opts.finIncome); // 분리과세로 남은 여유
    const below = Math.min(dividend, room);
    const above = dividend - below;
    const compRate = Math.max(acc.dividendTaxRate, opts.marginalRate); // 종합과세 비교과세 하한
    const divTax = below * acc.dividendTaxRate + above * compRate;
    const transferTax = Math.max(0, gain - TRANSFER_DEDUCTION) * TRANSFER_RATE;
    const health = acc.healthInsuranceApplies ? dividend * opts.healthRate : 0; // 양도차익은 건보 미부과
    const taxBreakdown = [
      transferBase > 0 && { label: `양도소득세 (연 ${TRANSFER_DEDUCTION / 10_000}만 공제 후 22%)`, amount: transferTax },
      dividendBase > 0 && { label: "배당소득세 (15.4%/한계세율)", amount: divTax },
    ].filter(Boolean);
    return { dividend, gain, tax: divTax + transferTax, health, totalTax: divTax + transferTax + health, taxBreakdown };
  }
  if (engineId === "isa") {
    // 롤오버 테이블: 3년 주기 순이익 200만 비과세 → 연 환산 근사(연 200만 공제)
    const tax = Math.max(0, dividend - isaRule.taxFreeProfit) * isaRule.excessSeparateRate;
    return { dividend, tax, health: 0, totalTax: tax };
  }
  // 연금계좌는 과세이연 — 올해 낼 세금이 아니라 "수령 시 과세될 몫"의 추정치
  const tax = dividend * opts.pensionRate;
  return { dividend, tax, health: 0, totalTax: tax, deferred: true };
}

/* ── 스냅샷 → 비교표 한 벌 ──
 * inflow: 올해 신규 불입(연 환산)을 계좌 자산에 얹어 세금에 반영 */
function scenarioTable(snapshot, products, isaRule, accountsByEngine, opts, inflow = {}) {
  const productById = Object.fromEntries(products.map((p) => [p.id, p]));
  const COLS = [
    { engineId: "general", meta: accountsByEngine.general },
    { engineId: "isa", meta: accountsByEngine.isa },
    { engineId: "pension", meta: accountsByEngine.pension },
  ];
  const columns = COLS.map(({ engineId, meta }) => {
    const holdings = snapshot[engineId]?.holdings || [];
    const grouped = new Map();
    let dividendBase = 0;
    let transferBase = 0; // 해외상장(양도세 과세) 자산
    for (const h of holdings) {
      const p = productById[h.productType];
      const label = p?.label || h.productType;
      grouped.set(label, (grouped.get(label) || 0) + (h.value || 0));
      if (p?.taxClass === "foreignTransfer") transferBase += h.value || 0;
      else dividendBase += h.value || 0;
    }
    const productsAgg = [...grouped.entries()].map(([label, value]) => ({ label, value }));
    if (inflow[engineId] > 0) {
      productsAgg.push({ label: "올해 신규 불입", value: inflow[engineId] });
      // 신규 불입은 해당 계좌의 지배적 과세 클래스를 따른다고 가정 (기존 습관 유지)
      if (engineId === "general" && transferBase > dividendBase) transferBase += inflow[engineId];
      else dividendBase += inflow[engineId];
    }
    const totalValue = productsAgg.reduce((s, p) => s + p.value, 0);
    const est = estimateTax(engineId, { dividendBase, transferBase }, isaRule, accountsByEngine, opts);
    return {
      id: engineId,
      name: engineId === "pension" ? "연금계좌 (연금저축·IRP)" : meta.name,
      taxNote: meta.taxNote,
      pros: meta.pros,
      cons: meta.cons,
      use: meta.use,
      products: productsAgg,
      totalValue,
      ...est,
    };
  });
  return { columns, totalTax: columns.reduce((s, c) => s + c.totalTax, 0) };
}

/* ── ② 리밸런싱 제안 — 운용기간 룰 × 상품 편입가능 × ISA 제한 ── */
function proposeMoves(snapshot, products, horizon, { isaUsable, isaSwitchRoom = 0 }) {
  const productById = Object.fromEntries(products.map((p) => [p.id, p]));
  // horizon.rebalanceTargets 가 허용한 계좌만 이동 대상 (상시=이동 없음)
  const targets = horizon.rebalanceTargets.filter((t) => !(t === "isa" && !isaUsable));

  const next = cloneSnapshot(snapshot);
  const moves = [];
  for (const h of [...(snapshot.general?.holdings || [])]) {
    const product = productById[h.productType];
    if (!product) continue;
    // 편입 가능(ok/cond)한 엔진 계좌 집합
    const eligible = new Set();
    for (const [profileId, status] of Object.entries(product.eligibility)) {
      if (status === "no") continue;
      eligible.add(profileId === "pensionSavings" || profileId === "irp" ? "pension" : profileId);
    }
    const best = targets
      .filter((t) => eligible.has(t) && ENGINE_TAX_RANK[t] < ENGINE_TAX_RANK.general)
      .sort((a, b) => ENGINE_TAX_RANK[a] - ENGINE_TAX_RANK[b])[0];
    if (!best) continue;

    const from = next.general;
    const i = from.holdings.findIndex((x) => x.name === h.name);
    if (i < 0) continue;
    const [moved] = from.holdings.splice(i, 1);
    (next[best] ||= { holdings: [] }).holdings.push(moved);
    moves.push({
      name: moved.name,
      label: product.label,
      value: moved.value,
      from: "증권계좌 (일반)",
      to: best === "pension" ? "연금계좌 (연금저축·IRP)" : "ISA 계좌",
      gainNote: best === "pension" ? "과세이연 — 배당·차익 세금 없이 재투자 복리" : "비과세 한도 + 손익통산 적용",
      condNote: product.condNote || null,
      method: "매도 → 현금 이체 → 재매수 (계좌 간 상품 이동 불가)",
    });
  }

  /* 해외상장 스위칭 — 양도소득세(22%) 방어 전략:
   * 매각 → ISA 현금 납입(올해 잔여 한도 내) → 동일 지수 국내상장 ETF 재매수.
   * 이후 수익은 ISA 분리과세(순이익 200만 비과세 후 9.9%)로 과세된다. */
  if (isaUsable && horizon.useIsa && isaSwitchRoom > 0) {
    let room = isaSwitchRoom;
    for (const h of [...(next.general?.holdings || [])]) {
      if (room <= 0) break;
      const product = productById[h.productType];
      if (product?.taxClass !== "foreignTransfer" || !product.switchTo) continue;
      const amount = Math.min(h.value, room);
      room -= amount;
      h.value -= amount;
      if (h.value <= 0) next.general.holdings = next.general.holdings.filter((x) => x !== h);
      (next.isa ||= { holdings: [] }).holdings.push({
        name: `${h.name} (국내상장 대체)`,
        productType: product.switchTo,
        value: amount,
      });
      moves.push({
        type: "switch",
        name: h.name,
        label: product.label,
        value: amount,
        from: "증권계좌 (일반)",
        to: "ISA 계좌",
        gainNote: "양도세 22% → ISA 분리과세(순이익 200만 비과세 후 9.9%)로 방어",
        condNote: "ISA 연 납입 한도 내 단계적 이전 — 잔여분은 매년 반복 (누적 한도 1억)",
        method: "매각 → ISA 납입 → 동일 지수 국내상장 ETF 재매수 (매각 시 기존 차익 양도세 1회 발생)",
      });
    }
  }

  return { snapshot: next, moves };
}

/* ── ③ 월 불입 배분 — 운용기간 우선순위 워터폴 ── */
function allocateMonthly(monthly, accounts, rooms, horizon, { isaBlocked }) {
  const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]));
  let remaining = monthly * 12; // 연 환산 예산
  const rows = [];
  const priority = [...horizon.accountPriority, "general"]; // 우선순위 소진 후 일반계좌

  for (const id of [...new Set(priority)]) {
    if (remaining <= 0) break;
    if (id === "isa" && isaBlocked) continue;
    const room = roomById[id];
    const cap = room?.room == null ? Infinity : room.room;
    const putAnnual = Math.min(remaining, cap);
    if (putAnnual <= 0) continue;
    remaining -= putAnnual;
    rows.push({
      accountId: id,
      name: room?.name || id,
      monthly: floorTo(putAnnual / 12, 1_000),
      annual: Math.round(putAnnual),
      reason:
        id === "general"
          ? "절세 한도 소진 후 초과분"
          : room?.roomType === "deduct"
            ? "세액공제 여력 우선 충전"
            : "비과세·손익통산 한도 활용",
    });
  }
  return rows;
}

/**
 * 전략 산출 — 사용자 입력에 따라 결과가 달라진다.
 * @param {object} input
 *  - answers: { productStyle, horizon: 'anytime'|'midshort'|'ultralong' }
 *  - monthly: 월 불입 가능액(원)
 *  - finIncome: 전년도 금융소득(원) — ISA 가입 제한·종합과세 판정
 *  - totalIncome: 전년도 총소득(원) — 세액공제율
 *  - snapshot: 마이데이터 계좌 스냅샷 (없으면 표본)
 */
/* 연금소득세율 — 수령 시점(만 55세 이후) 나이 구간별. 현재 나이가 55 미만이면 55세 개시 가정 */
function pensionRateByAge(age, fallback = 0.055) {
  const at = Math.max(55, Number(age) || 55);
  if (at >= 80) return 0.033;
  if (at >= 70) return 0.044;
  return fallback;
}

export async function buildStrategy(input = {}) {
  const { answers = {}, monthly = 0, finIncome = 0, totalIncome = 0, age = 45 } = input;

  const [accounts, products, isaRule, horizon, sample, versions] = await Promise.all([
    findAccounts(),
    findProducts(),
    findIsaRollover(),
    findHorizonById(answers.horizon),
    findSampleSnapshot(),
    tableVersions(),
  ]);
  const snapshot = input.snapshot || sample;
  const accountsByEngine = {
    general: accounts.find((a) => a.id === "general"),
    isa: accounts.find((a) => a.id === "isa"),
    pension: accounts.find((a) => a.id === "pensionSavings"),
  };

  // ISA 가입 제한 (롤오버 테이블의 joinRestriction)
  // 신규 가입·재가입만 제한 — 이미 보유한 ISA에는 계속 납입 가능
  const isaJoinBlocked = finIncome > isaRule.joinRestriction.finIncomeThreshold;
  const hasIsa = !!snapshot.isa;
  const isaUsable = hasIsa || !isaJoinBlocked;

  const rooms = buildRooms(accounts, snapshot, { totalIncome, isaJoinBlocked, hasIsa });

  const opts = {
    ...DEFAULTS,
    pensionRate: pensionRateByAge(age, accountsByEngine.pension?.withdrawalTaxRate),
    finIncome,
    marginalRate: marginalRate(totalIncome),
  };

  // 배분을 먼저 산출 — 제안 시나리오의 신규 불입 흐름으로 쓰인다
  const allocation = allocateMonthly(monthly, accounts, rooms, horizon, { isaBlocked: !isaUsable });

  // ISA 스위칭 여력 = 올해 ISA 잔여 납입 한도 − 신규 불입 배분분
  const isaRoom = rooms.find((r) => r.id === "isa")?.room ?? 0;
  const isaAllocated = allocation.find((a) => a.accountId === "isa")?.annual || 0;
  const isaSwitchRoom = Math.max(0, isaRoom - isaAllocated);

  // 현재: 지금 습관 유지 가정 — 신규 불입 전액이 일반계좌로
  const currentInflow = { general: monthly * 12 };
  // 제안: 배분안대로 각 계좌에 유입
  const proposedInflow = {};
  for (const a of allocation) {
    const eng = a.accountId === "pensionSavings" || a.accountId === "irp" ? "pension" : a.accountId;
    proposedInflow[eng] = (proposedInflow[eng] || 0) + a.annual;
  }

  const current = scenarioTable(snapshot, products, isaRule, accountsByEngine, opts, currentInflow);
  const proposed0 = proposeMoves(snapshot, products, horizon, { isaUsable, isaSwitchRoom });
  const proposed = scenarioTable(proposed0.snapshot, products, isaRule, accountsByEngine, opts, proposedInflow);

  const fmtMan = (v) => `${Math.round(v / 10_000).toLocaleString()}만원`;
  const notes = [];
  if (finIncome > COMP_TAX_THRESHOLD && current.columns[0].dividend > 0)
    notes.push(
      `전년도 금융소득이 2,000만원을 넘어 일반계좌 배당에는 종합과세 한계세율 ${(opts.marginalRate * 100).toFixed(1)}%가 적용돼요 — 절세계좌 이전 효과가 그만큼 커요.`
    );
  if (isaJoinBlocked)
    notes.push(
      hasIsa
        ? "금융소득종합과세 대상이라 ISA 만기 후 재가입이 제한될 수 있어요 — 기존 계좌 납입(연 한도 내)은 계속 가능해요."
        : "전년도 금융소득이 2,000만원을 넘어 ISA 신규 가입이 제한돼요 — ISA 활용이 전략에서 제외됐어요."
    );

  // 해외상장 스위칭 전략 안내 — 올해 이전분과 잔여분(다년 계획)
  const switchMoves = proposed0.moves.filter((m) => m.type === "switch");
  if (switchMoves.length > 0) {
    const remaining = (proposed0.snapshot.general?.holdings || [])
      .filter((h) => ["foreignStock", "foreignEtf"].includes(h.productType))
      .reduce((s, h) => s + h.value, 0);
    notes.push(
      `해외상장 ETF 양도세(22%) 방어: 올해 ISA 잔여 한도 ${fmtMan(switchMoves.reduce((s, m) => s + m.value, 0))}만큼 매각→ISA 재매수로 이전했어요.` +
        (remaining > 0 ? ` 남은 ${fmtMan(remaining)}은 매년 ISA 한도(연 2,000만)로 반복 이전하면 점진적으로 분리과세 영역으로 옮겨져요.` : "")
    );
  }

  if (horizon.id === "anytime")
    notes.push("상시 인출 성향이라 의무기간 있는 계좌(ISA·연금)로의 이동을 제안하지 않아요.");
  if (horizon.id === "ultralong" && !isaJoinBlocked)
    notes.push(`ISA는 ${isaRule.termYears}년 만기마다 롤오버하고, 만기자금을 연금계좌로 옮기면 이전액 10%(최대 ${isaRule.pensionTransferBonus.cap / 10_000}만원) 추가 세액공제를 받아요.`);

  return {
    profile: {
      horizon: horizon.id,
      horizonLabel: horizon.label,
      goal: horizon.goal,
      isaJoinBlocked,
      isaUsable,
      marginalRate: opts.marginalRate,
      inputs: { age, monthly, finIncome, totalIncome }, // 입력 echo — 연동 확인용
    },
    rooms,
    comparison: {
      current,
      proposed,
      moves: proposed0.moves,
      savings: Math.max(0, current.totalTax - proposed.totalTax),
      assumptions: opts,
    },
    allocation,
    notes,
    meta: { source: "file-db", tables: versions },
  };
}
