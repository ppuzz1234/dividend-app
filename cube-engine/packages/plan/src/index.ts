/**
 * @cube/plan — 미션 2 최소판. **"이런 상황이면 얼마인가"를 코드가 계산한다.**
 *
 * 이 패키지에 세법 값은 없다. 값은 승인된 정책 팩에서만 오고, 없으면 **무엇이 없는지 말한다.**
 */
export type { Extracted, Situation } from "./situation.js";
export { extractSituation } from "./situation.js";

export type { AskSpec, ComputeResult, InputKey, Scenario } from "./scenarios.js";
export { INPUT_LABEL, SCENARIOS, pickScenarios, tryResolve, won } from "./scenarios.js";

export type { PlanDeps, PlanOutcome, PlanRun } from "./run.js";
export { runPlan } from "./run.js";

export type { ApprovedFact, ApprovedFacts, SourceRef } from "./approved.js";
export { approvedFactsFor } from "./approved.js";
