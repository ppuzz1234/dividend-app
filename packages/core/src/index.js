/* ------------------------------------------------------------------ *
 *  @devidend/core — 배당 눈덩이 도메인 엔진 공개 API
 *  파이프라인: profile → capacity → taxopt → (rebalance ∥ plan)
 *              → simulate(gap) → order   (docs/ARCHITECTURE.md 참조)
 *  세부 모듈은 딥 임포트도 가능: "@devidend/core/knowledge/accounts.js"
 * ------------------------------------------------------------------ */

/* 지식 베이스 */
export { ACCOUNTS, PENSION_WITHDRAWAL, COMP_TAX, deductionRate } from "./knowledge/accounts.js";
export { ACCOUNT_PROFILES, CONTRIBUTION_PRIORITY, ENGINE_ACCOUNT_MAP, profilesForEngineId, PROFILE_VERSION } from "./knowledge/accountProfiles.js";
export { PRODUCT_ELIGIBILITY, ELIGIBILITY_ACCOUNTS, eligibleAccountsFor, productsForAccount, ELIGIBILITY_VERSION } from "./knowledge/productEligibility.js";
export { STOCKS, CATEGORIES } from "./knowledge/stocks.js";
export { ACCOUNT_PRODUCTS, recommendedProducts, accountStrategy, findProduct, ACCOUNT_PRODUCTS_VERSION } from "./knowledge/accountProducts.js";
export { ETF_BENCHMARKS } from "./knowledge/etfBenchmarks.js";

/* ① 고객 정보·성향 (profile) */
export { SURVEY_QUESTIONS, SURVEY_MONTHLY, SURVEY_VERSION, surveyComplete, surveyGoal } from "./profile/survey.js";
export { buildRiskProfile } from "./profile/riskProfile.js";

/* 보유 현황 (holdings) */
export { MYDATA_ACCOUNTS, MYDATA_PROFILE, normalizeSnapshot } from "./holdings/snapshot.js";

/* ② 투자 여력 (capacity) */
export { assessCapacity } from "./capacity/capacity.js";

/* ④ 리밸런싱 (rebalance) */
export { buildRebalance } from "./rebalance/rebalance.js";

/* ⑦ 주문 계획 (order) */
export { buildOrderPlan } from "./order/orderPlan.js";

/* ③ 절세 최적화 (taxopt) */
export { accountHeadroom } from "./taxopt/headroom.js";
export { allocate } from "./taxopt/optimizer.js";

/* ⑤ 배분 제안 (plan) */
export { buildStrategy, STRATEGY_PLAYBOOK } from "./plan/strategy.js";
export { recommendByAccount, chosenCategories } from "./plan/assetLocation.js";
export {
  buildAccountRooms,
  TAX_PREFS,
  ISA_ROLLOVERS,
  encodeStrategy,
  decodeStrategy,
  encodePerAccount,
  decodePerAccount,
} from "./plan/accountRooms.js";
export { projectIsaRollover } from "./plan/isaRollover.js";
export { buildStrategyComparison, PRODUCT_GROUP_LABELS } from "./plan/strategyTable.js";

/* ⑥ 시뮬레이션 */
export { blend, simulate, simulateOne, simulatePortfolio } from "./simulate/simulate.js";
export { projectRetirementScenario } from "./simulate/retirementScenario.js";

/* 인사이트 (은퇴기 배당 계좌별 세금·건보료 비교) */
export { compareDividendTax, DIVIDEND_TAX_CONST } from "./insight/dividendTaxCompare.js";

/* 공용 유틸 */
export { fmtKRW, fmtShort, avg } from "./util/format.js";
