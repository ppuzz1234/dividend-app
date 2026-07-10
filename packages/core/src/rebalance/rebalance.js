import { PRODUCT_ELIGIBILITY } from "../knowledge/productEligibility.js";
import { ENGINE_ACCOUNT_MAP } from "../knowledge/accountProfiles.js";
import { ACCOUNTS } from "../knowledge/accounts.js";

/* ------------------------------------------------------------------ *
 *  ④ 보유 상품 운용 계좌 조정 — 리밸런싱 제안
 *  보유 스냅샷의 각 상품을 productEligibility 와 대조해
 *  "더 절세 유리한 계좌로 옮길 수 있는가"를 판단한다.
 *  · 계좌 간 상품 '이동'은 불가 → 매도 후 현금 이체·재매수가 실행 방법
 *  · 세 우선순위: 연금(과세이연) > ISA(비과세·통산) > 일반(15.4%)
 * ------------------------------------------------------------------ */

const TAX_RANK = { pension: 0, isa: 1, general: 2 }; // 낮을수록 절세 유리
const byId = Object.fromEntries(ACCOUNTS.map((a) => [a.id, a]));

/* 상품 행 → 편입 가능한 엔진 계좌 id 집합 (ok/cond) */
function engineEligible(row) {
  const set = new Map(); // engineId -> note(cond일 때)
  for (const [profileId, engineId] of Object.entries(ENGINE_ACCOUNT_MAP)) {
    const cell = row[profileId];
    if (!cell || cell.status === "no") continue;
    // 이미 ok로 담겼으면 cond note로 덮지 않음
    if (!set.has(engineId) || set.get(engineId)) {
      set.set(engineId, cell.status === "cond" ? cell.note : null);
    }
  }
  return set;
}

/**
 * @param {object|null} snapshot  MYDATA_ACCOUNTS 형태 { [accountId]: { holdings: [...] } }
 * @returns {{ proposals, keeps, totalMovable }}
 *  proposals: [{ from, to, holding, gainNote, condNote, method }]
 *  keeps:     [{ account, holding, reason }]
 */
export function buildRebalance(snapshot) {
  const proposals = [];
  const keeps = [];
  if (!snapshot) return { proposals, keeps, totalMovable: 0 };

  for (const [accId, acc] of Object.entries(snapshot)) {
    for (const h of acc.holdings || []) {
      const row = PRODUCT_ELIGIBILITY.find((p) => p.id === h.productType);
      if (!row) continue;
      const eligible = engineEligible(row);

      // 이미 절세계좌(ISA·연금)에 있으면 유지 — 절세계좌 간 이동은
      // 납입한도 소진·의무기간 리스크가 커서 제안하지 않는다
      if (accId !== "general") {
        keeps.push({ account: byId[accId], holding: h, reason: "이미 절세계좌에서 운용 중이에요" });
        continue;
      }

      // 일반계좌 보유분만: 더 절세 유리한 계좌 중 최상위로 제안
      const better = [...eligible.keys()]
        .filter((id) => TAX_RANK[id] < TAX_RANK[accId])
        .sort((a, b) => TAX_RANK[a] - TAX_RANK[b])[0];

      if (better) {
        proposals.push({
          from: byId[accId],
          to: byId[better],
          holding: h,
          gainNote:
            better === "pension"
              ? "과세이연 — 배당·차익 세금 없이 재투자 복리"
              : "비과세 한도 + 손익통산 적용",
          condNote: eligible.get(better) || null,
          method: "매도 → 현금 이체 → 재매수 (계좌 간 상품 이동은 불가)",
        });
      } else {
        keeps.push({
          account: byId[accId],
          holding: h,
          reason:
            eligible.size === 1 && eligible.has("general")
              ? "해외상장 상품은 절세계좌 편입 불가 — 국내상장 해외ETF로 대체 시 이전 가능"
              : "이미 절세 순위가 가장 유리한 계좌에 있어요",
        });
      }
    }
  }

  const totalMovable = proposals.reduce((s, p) => s + (p.holding.value || 0), 0);
  return { proposals, keeps, totalMovable };
}
