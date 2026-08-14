/**
 * 실행 — 상황을 읽고, 승인된 규칙으로 계산하고, **모자라면 무엇이 모자란지 말한다.**
 *
 * 결과는 셋 중 하나다:
 *   `COMPUTED`     — 계산했다. 각 값이 어느 규칙에서 왔는지 추적된다.
 *   `NEEDS_INPUT`  — 규칙은 있는데 **사용자가 안 알려준 값**이 있다. 무엇인지 이름으로 말한다.
 *   `NEEDS_RULE`   — **승인된 규칙이 없다.** 어느 규칙인지, 왜 없는지 말한다.
 *
 * ★ `NEEDS_RULE` 이 이 설계의 핵심이다. "계산 못 합니다"로 끝내면 사용자는 영원히 못 쓴다.
 *   *"세액공제율 규칙이 아직 승인되지 않았습니다"* 라고 말해야 **채울 수 있는 빈칸**이 된다.
 *   그리고 승인이 들어오면 **코드를 고치지 않고** 그대로 동작한다.
 */

import type { PolicyRegistry, PolicyValue } from "@cube/policy";

import type { ComputeResult, Scenario } from "./scenarios.js";
import { INPUT_LABEL, pickScenarios, tryResolve } from "./scenarios.js";
import type { AskSpec, InputKey } from "./scenarios.js";
import { extractSituation } from "./situation.js";
import type { Situation } from "./situation.js";

export type PlanOutcome =
  | { readonly kind: "NO_SCENARIO" }
  | {
      readonly kind: "NEEDS_INPUT";
      readonly scenario: Scenario;
      readonly missing: readonly string[];
      /** 되묻기 — 슬롯마다 질문 문구와 (승인 규칙에서 나온) 보기. */
      readonly asks: readonly { key: InputKey; spec: AskSpec }[];
    }
  | { readonly kind: "NEEDS_RULE"; readonly scenario: Scenario; readonly missingRules: readonly string[] }
  | {
      readonly kind: "COMPUTED";
      readonly scenario: Scenario;
      readonly result: ComputeResult;
      readonly usedRules: readonly string[];
      /**
       * **더 잘 맞았지만 규칙이 없어 못 한 시나리오.**
       *
       * 실측 버그: `"세액공제 얼마 받아?"` 에 **납입한도** 답이 나왔다. 세액공제 시나리오가
       * 규칙 미승인이라 조용히 다음 후보로 넘어간 것이다 — **묻지 않은 것을 답하면서
       * 그렇다고 말하지도 않았다.** 이 목록을 함께 실어 "그건 아직 못 한다"를 반드시 말한다.
       */
      readonly skippedForMissingRules: readonly { scenario: Scenario; missingRules: readonly string[] }[];
    };

export interface PlanRun {
  readonly situation: Situation;
  readonly outcome: PlanOutcome;
}

export interface PlanDeps {
  /** 승인된 정책 팩. 없으면(팩 0건) 모든 시나리오가 `NEEDS_RULE` 이 된다. */
  readonly registry: PolicyRegistry | null;
  readonly queryAsOf: string;
}

export function runPlan(query: string, deps: PlanDeps): PlanRun {
  const situation = extractSituation(query);
  const candidates = pickScenarios(query);
  if (candidates.length === 0) return { situation, outcome: { kind: "NO_SCENARIO" } };

  // ★ 규칙을 **입력보다 먼저** 본다. 규칙이 없으면 입력을 아무리 받아도 계산할 수 없으므로,
  //   "총급여를 알려주세요" 라고 물어놓고 나중에 "사실 규칙이 없습니다" 라고 하면 안 된다.
  let firstNeedsInput: PlanOutcome | null = null;
  const skipped: { scenario: Scenario; missingRules: readonly string[] }[] = [];

  for (const sc of candidates) {
    const values = new Map<string, PolicyValue>();
    const missingRules: string[] = [];
    for (const rid of sc.needsRules) {
      const v = tryResolve(deps.registry, rid, deps.queryAsOf);
      if (v === undefined) missingRules.push(rid);
      else values.set(rid, v);
    }
    if (missingRules.length > 0) {
      // 다른 시나리오가 될 수도 있으니 바로 반환하지 않되, **넘어갔다는 사실을 남긴다.**
      skipped.push({ scenario: sc, missingRules });
      if (candidates.length === 1) return { situation, outcome: { kind: "NEEDS_RULE", scenario: sc, missingRules } };
      continue;
    }

    const missingKeys = sc.needsInputs.filter((k) => situation[k] === undefined);
    if (missingKeys.length > 0) {
      const asks = missingKeys
        .map((k) => ({ key: k, spec: sc.ask?.(k, values) }))
        .filter((x): x is { key: InputKey; spec: AskSpec } => x.spec !== undefined);
      firstNeedsInput ??= {
        kind: "NEEDS_INPUT",
        scenario: sc,
        missing: missingKeys.map((k) => INPUT_LABEL[k]),
        asks,
      };
      continue;
    }

    try {
      return {
        situation,
        outcome: {
          kind: "COMPUTED",
          scenario: sc,
          result: sc.compute(situation, values),
          usedRules: sc.needsRules,
          skippedForMissingRules: skipped,
        },
      };
    } catch {
      // 규칙 값이 기대한 모양이 아니다(예: 나이 기준인데 unit 이 KRW). **추측해서 쓰지 않는다.**
      skipped.push({ scenario: sc, missingRules: sc.needsRules });
      if (candidates.length === 1) {
        return { situation, outcome: { kind: "NEEDS_RULE", scenario: sc, missingRules: sc.needsRules } };
      }
    }
  }

  if (firstNeedsInput !== null) return { situation, outcome: firstNeedsInput };
  const first = candidates[0];
  if (first === undefined) return { situation, outcome: { kind: "NO_SCENARIO" } };
  return {
    situation,
    outcome: {
      kind: "NEEDS_RULE",
      scenario: first,
      missingRules: first.needsRules.filter((r) => tryResolve(deps.registry, r, deps.queryAsOf) === undefined),
    },
  };
}
