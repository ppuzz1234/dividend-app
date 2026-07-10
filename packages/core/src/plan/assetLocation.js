import { ACCOUNTS } from "../knowledge/accounts.js";
import { CATEGORIES } from "../knowledge/stocks.js";

/* ------------------------------------------------------------------ *
 *  Asset Location — 계좌 성격 × 개인 목표에 맞는 상품 유형(영역) 추천
 *  · 절세계좌(연금/ISA)엔 매년 과세되는 고배당·고분배 자산이 유리
 *    (과세이연/비과세 효과 극대화), 일반계좌엔 배당이 적고 시세차익
 *    위주인 배당성장형이 세금 측면에서 유리하다는 원칙을 단순화한 룰.
 *  · 영역만 분리한 1차 버전 — 정교한 로직은 추후 고도화.
 * ------------------------------------------------------------------ */

const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/** 목표별 계좌→상품유형 매핑 + 사유 */
function mapping(goal) {
  if (goal === "cashflow") {
    return {
      isa: { category: "coveredcall", reason: "비과세 한도 안에서 커버드콜 고분배로 월 현금흐름을 키워요." },
      pension: { category: "high", reason: "과세이연 계좌라 고배당을 재투자하면 세금 없이 복리가 굴러가요." },
      general: { category: "growth", reason: "매년 배당세(15.4%)가 붙으니 배당성장주로 세금을 최소화해요." },
    };
  }
  // retirement (기본)
  return {
    pension: { category: "etf", reason: "장기 노후자금이라 배당성장 ETF로 분산해 길게 굴려요." },
    isa: { category: "high", reason: "비과세·분리과세라 고배당주 수령에 유리해요." },
    general: { category: "growth", reason: "매년 과세되는 계좌라 배당성장주로 세금을 이연해요." },
  };
}

/**
 * 계좌별 상품유형 추천.
 * @param {object} profile  { goal, age, income }
 * @param {string[]} [accountIds]  대상 계좌 (기본: 전 계좌)
 * @returns {Array<{accountId, account, category, categoryLabel, reason}>}
 */
export function recommendByAccount({ goal = "retirement" } = {}, accountIds) {
  const map = mapping(goal);
  const ids = accountIds?.length ? accountIds : ACCOUNTS.map((a) => a.id);
  return ids.map((id) => {
    const acc = ACCOUNTS.find((a) => a.id === id) || ACCOUNTS[0];
    const rec = map[id] || { category: "growth", reason: "" };
    return {
      accountId: id,
      account: acc,
      category: rec.category,
      categoryLabel: CATEGORY[rec.category]?.label || rec.category,
      reason: rec.reason,
    };
  });
}

/** 추천 결과에서 사용할 상품유형 집합(중복 제거) */
export function chosenCategories(recommendations) {
  return [...new Set(recommendations.map((r) => r.category))];
}
