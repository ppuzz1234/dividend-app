/**
 * 거절 매트릭스 D·E 절 — 최적화 성질 호환성 (§5.3.1 v1.4) · 메커니즘 그래프 로더 불변식 (§5.3.3~5.3.4).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PolicyContractError,
  REJECTION_RULES,
  assertDeterministicOrder,
  loadAccountSpecs,
  loadPolicyPack,
} from "../src/index.js";
import { engine, engineWith, expectReject, pack, spec } from "./helpers.js";

const SPEC_VERSION = "DEMO-SPECS-0001";

function load(rawSpecs: unknown[], eng = engine()) {
  return loadAccountSpecs(rawSpecs, loadPolicyPack(pack()), eng, SPEC_VERSION);
}

const SAFE_PROPS = {
  piecewiseLinear: true,
  piecewiseMonotone: true,
  finiteBreakpoints: true,
  crossAccountInteraction: false,
  pathDependent: false,
  nonConvex: false,
};

test("R36 instanceId 중복", () => {
  const s = spec();
  s["mechanismInstances"][1]["mechanismInstanceId"] =
    s["mechanismInstances"][0]["mechanismInstanceId"];
  expectReject(() => load([s]), "DUPLICATE_MECHANISM_INSTANCE_ID", "R36");
});

test("R43 성질 미선언", () => {
  const eng = engineWith("TAX_CREDIT", { optimizationProperties: undefined });
  expectReject(() => load([spec()], eng), "OPTIMIZATION_PROPERTIES_MISSING", "R43");
});

test("R44 비볼록+무한경계", () => {
  const eng = engineWith("TAX_CREDIT", {
    optimizationProperties: { ...SAFE_PROPS, nonConvex: true, finiteBreakpoints: false },
  });
  const err = expectReject(() => load([spec()], eng), "UNSUPPORTED_OPTIMIZATION_PROPERTIES", "R44");
  assert.match(err.message, /NON_CONVEX_WITHOUT_FINITE_BREAKPOINTS/);
  assert.match(err.message, /SPEC/, "사양 근거 규칙임을 오류에 표시해야 한다");
});

test("R45 경로의존+무한경계", () => {
  const eng = engineWith("TAX_CREDIT", {
    optimizationProperties: { ...SAFE_PROPS, pathDependent: true, finiteBreakpoints: false },
  });
  const err = expectReject(() => load([spec()], eng), "UNSUPPORTED_OPTIMIZATION_PROPERTIES", "R45");
  assert.match(err.message, /PATH_DEPENDENT_WITHOUT_FINITE_BREAKPOINTS/);
  assert.match(err.message, /CONSERVATIVE/, "사양 근거가 아니라 보수적 확장임을 표시해야 한다");
});

test("R46 구조 없음", () => {
  const eng = engineWith("TAX_CREDIT", {
    optimizationProperties: {
      ...SAFE_PROPS,
      piecewiseLinear: false,
      piecewiseMonotone: false,
      finiteBreakpoints: false,
    },
  });
  const err = expectReject(() => load([spec()], eng), "UNSUPPORTED_OPTIMIZATION_PROPERTIES", "R46");
  assert.match(err.message, /NO_EXPLOITABLE_STRUCTURE/);
});

test("거절 규칙은 사양 근거와 보수적 확장을 구분해 표시한다", () => {
  const bySpec = REJECTION_RULES.filter((r) => r.basis === "SPEC");
  const conservative = REJECTION_RULES.filter((r) => r.basis === "CONSERVATIVE");
  assert.equal(bySpec.length, 1, "사양이 명시한 조합은 하나뿐이다 (OPEN-Q3)");
  assert.ok(conservative.length > 0);
  for (const r of REJECTION_RULES) assert.ok(r.reason.length > 0);
});

test("R47 의존성 순환", () => {
  // CONTRIBUTION_LIMIT ↔ TAX_CREDIT 상호 의존을 만든다.
  const eng = engineWith("CONTRIBUTION_LIMIT", { dependsOnTypes: ["TAX_CREDIT"] });
  expectReject(() => load([spec()], eng), "DEPENDENCY_CYCLE", "R47");
});

test("R48 선행 인스턴스 누락", () => {
  const s = spec();
  // TAX_CREDIT 은 CONTRIBUTION_LIMIT 에 의존하는데 그 인스턴스를 빼버린다.
  s["mechanismInstances"] = s["mechanismInstances"].filter(
    (m: Record<string, unknown>) => m["mechanismType"] !== "CONTRIBUTION_LIMIT",
  );
  s["requiredEngineCapabilities"] = s["requiredEngineCapabilities"].filter(
    (t: string) => t !== "CONTRIBUTION_LIMIT",
  );
  expectReject(() => load([s]), "MISSING_PREREQUISITE_INSTANCE", "R48");
});

test("R49 동시 쓰기 충돌", () => {
  // TAXABLE_SALE_TAX 가 DIVIDEND_DISTRIBUTION_TAX 와 같은 phase 에서 같은 필드에 쓰게 만든다.
  const eng = engineWith("TAXABLE_SALE_TAX", { writes: ["withheldTax"] });
  const err = expectReject(() => load([spec(1)], eng), "CONCURRENT_WRITE_SAME_PHASE", "R49");
  assert.match(err.message, /WITHDRAWAL_TAX/);
  assert.match(err.message, /withheldTax/);
});

test("R50 정렬 미결정", () => {
  // 정렬 키 검사를 직접 호출한다. 통합 경로에서는 R36 이 먼저 잡지만, 사양 §5.3.4 가 별도 조항으로
  // 규정한 검사이므로 독립적으로 존재하고 실제로 발화하는지 확인한다.
  const caps = new Map(engine().mechanisms.map((m) => [m.mechanismType, m]));
  const collided = [
    {
      mechanismInstanceId: "SAME_ID",
      mechanismType: "CONTRIBUTION_LIMIT" as const,
      parameterRuleIds: [],
      priority: 10,
    },
    {
      mechanismInstanceId: "SAME_ID",
      mechanismType: "CONTRIBUTION_LIMIT" as const,
      parameterRuleIds: [],
      priority: 10,
    },
  ];
  let caught: unknown;
  try {
    assertDeterministicOrder(collided, caps, "$.test");
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof PolicyContractError, "PolicyContractError 여야 한다");
  assert.equal(caught.code, "ORDER_UNDETERMINED");

  // 같은 phase·priority 라도 instanceId 가 다르면 결정된다.
  assertDeterministicOrder(
    [
      { ...collided[0]!, mechanismInstanceId: "A" },
      { ...collided[1]!, mechanismInstanceId: "B" },
    ],
    caps,
    "$.test",
  );
});
