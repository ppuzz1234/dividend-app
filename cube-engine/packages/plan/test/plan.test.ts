/**
 * 미션 2 최소판 — **계산은 코드가, 값은 승인 규칙에서, 모자라면 무엇이 모자란지.**
 *
 * 여기서 지키는 것:
 *  - 승인 규칙이 없으면 **추정하지 않고** 무엇이 없는지 말한다
 *  - 상황 추출이 **잘못 읽느니 안 읽는다** (월급 → 연 환산은 가정이므로 거절)
 *  - 더 잘 맞는 시나리오를 못 했으면 **그렇다고 말한다** (조용히 다른 답을 주지 않는다)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { PolicyRegistry, PolicyValue } from "@cube/policy";

import { runPlan } from "../src/run.js";
import { extractSituation, toWon } from "../src/situation.js";

const LIMIT_RULE = "INCTAX_D_40_2.CONTRIBUTION_LIMIT_COMPONENT.GENERAL";

/** 승인된 규칙 몇 개만 아는 최소 registry. 실제 Registry 와 같은 계약(없으면 throw)을 지킨다. */
function fakeRegistry(values: Record<string, PolicyValue>): PolicyRegistry {
  return {
    resolveEffect: (ruleId: string) => {
      const v = values[ruleId];
      if (v === undefined) throw new Error(`${ruleId}: 승인된 규칙이 없다`);
      return { value: { value: v, unit: "KRW" }, stamp: {} } as never;
    },
  } as never;
}

const REG = fakeRegistry({ [LIMIT_RULE]: { kind: "INTEGER", value: 18000000n } });
const ASOF = "2026-08-04";

// ─────────────────── 상황 추출 ───────────────────

test("금액 표기를 원 단위로 편다", () => {
  assert.equal(toWon("5천", "만원"), 50000000n);
  assert.equal(toWon("1,800", "만원"), 18000000n);
  assert.equal(toWon("1", "억원"), 100000000n);
});

test("★ 금액이 라벨보다 앞에 와도 읽는다 (한국어 어순)", () => {
  // 라벨→금액 순서만 보면 `"연금저축에 600만원 넣으면"` 을 못 읽는다(실측).
  const s = extractSituation("연금저축에 600만원 넣으면");
  assert.equal(s.contribution?.value, 6000000n);
});

test("★ 월급은 읽지 않는다 — 연 환산은 가정이기 때문", () => {
  // 상여·비과세 포함 여부를 모르는데 ×12 하면 **지어낸 값으로 계산**하게 된다.
  const s = extractSituation("월급 300만원인데 얼마 넣어야 돼?");
  assert.equal(s.grossSalary, undefined, "월급을 총급여로 읽었다");
  assert.equal(s.contribution, undefined, "월급 금액이 납입액으로 새어 들어갔다");
});

test("총급여와 납입액을 같은 문장에서 갈라 읽는다", () => {
  const s = extractSituation("총급여 5천만원인데 연금저축 600만원 넣으면");
  assert.equal(s.grossSalary?.value, 50000000n);
  assert.equal(s.contribution?.value, 6000000n);
});

test("나이는 단위가 붙은 것만 (`40세액공제` 에 안 걸린다)", () => {
  assert.equal(extractSituation("62살인데").age?.value, 62n);
  assert.equal(extractSituation("40세액공제 대상").age, undefined);
});

// ─────────────────── 계산 ───────────────────

test("★ 승인된 규칙으로 계산하고 값마다 규칙 id 를 붙인다", () => {
  const r = runPlan("IRP에 2천만원 넣어도 되나?", { registry: REG, queryAsOf: ASOF });
  assert.equal(r.outcome.kind, "COMPUTED");
  if (r.outcome.kind !== "COMPUTED") return;
  assert.match(r.outcome.result.headline, /200만원 초과/);
  const limitStep = r.outcome.result.steps.find((s) => s.fromRule === LIMIT_RULE);
  assert.ok(limitStep !== undefined, "한도 값에 근거 규칙이 안 붙었다 — 되짚을 수 없다");
  assert.equal(limitStep.value, "1,800만원");
});

test("한도 미만이면 여유액을 말한다", () => {
  const r = runPlan("연금계좌에 1,500만원 납입했는데 한도 넘었나", { registry: REG, queryAsOf: ASOF });
  assert.equal(r.outcome.kind, "COMPUTED");
  if (r.outcome.kind !== "COMPUTED") return;
  assert.match(r.outcome.result.headline, /300만원 더/);
});

test("★ 승인된 규칙이 없으면 추정하지 않고 어느 규칙이 없는지 말한다", () => {
  const r = runPlan("세액공제 얼마 받아?", { registry: null, queryAsOf: ASOF });
  assert.equal(r.outcome.kind, "NEEDS_RULE");
  if (r.outcome.kind !== "NEEDS_RULE") return;
  assert.ok(r.outcome.missingRules.some((x) => x.includes("INCTAX_59_3")), "빠진 규칙을 이름으로 안 말했다");
});

test("★ 입력이 모자라면 무엇이 필요한지 이름으로 말한다", () => {
  const r = runPlan("얼마까지 넣을 수 있어?", { registry: REG, queryAsOf: ASOF });
  assert.equal(r.outcome.kind, "NEEDS_INPUT");
  if (r.outcome.kind !== "NEEDS_INPUT") return;
  assert.deepEqual(r.outcome.missing, ["연금계좌 납입액"]);
});

test("★ 더 잘 맞는 시나리오를 못 했으면 그렇다고 말한다 (조용히 다른 답을 주지 않는다)", () => {
  // 실측 버그: "세액공제 얼마 받아?" 에 **납입한도** 답이 나왔다 —
  // 세액공제가 미승인이라 조용히 다음 후보로 넘어간 것.
  const r = runPlan("총급여 5천만원인데 연금저축 600만원 넣으면 세액공제 얼마 받아?", {
    registry: REG,
    queryAsOf: ASOF,
  });
  assert.equal(r.outcome.kind, "COMPUTED");
  if (r.outcome.kind !== "COMPUTED") return;
  assert.ok(r.outcome.skippedForMissingRules.length > 0, "못 한 시나리오를 숨겼다");
  assert.match(r.outcome.skippedForMissingRules[0]?.scenario.title ?? "", /세액공제/);
});

test("맞는 시나리오가 없으면 없다고 한다", () => {
  assert.equal(runPlan("오늘 날씨 어때", { registry: REG, queryAsOf: ASOF }).outcome.kind, "NO_SCENARIO");
});

test("0 은 `0억원` 이 아니라 `0원` 이다", () => {
  // `0 % 1억 === 0` 이라 억 단위로 떨어졌다(실측: "여유액 0억원").
  const r = runPlan("연금계좌에 1,800만원 납입했어", { registry: REG, queryAsOf: ASOF });
  assert.equal(r.outcome.kind, "COMPUTED");
  if (r.outcome.kind !== "COMPUTED") return;
  assert.ok(r.outcome.result.steps.every((s) => !s.value.startsWith("0억")), "0억원 이 나왔다");
});

test("★ 되묻기 보기는 승인된 규칙 값에서만 나온다", () => {
  const r = runPlan("얼마까지 넣을 수 있어?", { registry: REG, queryAsOf: ASOF });
  assert.equal(r.outcome.kind, "NEEDS_INPUT");
  if (r.outcome.kind !== "NEEDS_INPUT") return;
  const spec = r.outcome.asks[0]?.spec;
  assert.ok(spec !== undefined, "되물을 문구가 없다");
  assert.match(spec.question, /얼마를 납입/);
  // 보기의 금액은 **한도 규칙**에서 왔고, 어느 규칙인지 함께 실린다.
  assert.equal(spec.options[0]?.fromRule, LIMIT_RULE);
  assert.match(spec.options[0]?.label ?? "", /1,800만원/);
});

test("규칙이 없으면 보기도 없다 — 기준값을 지어내지 않는다", () => {
  const r = runPlan("얼마까지 넣을 수 있어?", { registry: null, queryAsOf: ASOF });
  // 규칙이 없으면 애초에 NEEDS_RULE 이다. 보기를 만들 근거가 없다는 뜻이기도 하다.
  assert.equal(r.outcome.kind, "NEEDS_RULE");
});

test("★ 슬라이더 범위도 승인 규칙에서 나온다 (UI 가 최댓값을 정하지 않는다)", () => {
  // 최댓값이 곧 한도 = 세법 값이다. UI 가 정하면 절대 규칙 1 위반.
  const r = runPlan("얼마까지 넣을 수 있어?", { registry: REG, queryAsOf: ASOF });
  assert.equal(r.outcome.kind, "NEEDS_INPUT");
  if (r.outcome.kind !== "NEEDS_INPUT") return;
  const range = r.outcome.asks[0]?.spec.range;
  assert.ok(range !== undefined, "범위가 없다");
  assert.equal(range.min, "0");
  assert.equal(range.max, "1800", "만원 환산은 plan 에서 해야 한다 (UI 는 나눗셈 금지)");
  assert.equal(range.maxLabel, "1,800만원");
});

// ─────────────────────────────────────────────────────────────────────────────
// ① 공식 팩트 인출 — **조문 id 로 승인 규칙을 찾는다.**
//
// 여기서 지키는 것: 값은 registry 에서만 나오고, 승인 안 된 규칙은 값이 있어도 안 나오고,
// 조문이 안 걸리면 "0건"이 나온다(숨기지 않는다).
// ─────────────────────────────────────────────────────────────────────────────

import { approvedFactsFor } from "../src/approved.js";

interface FakeRule {
  readonly sourceIds: readonly string[];
  readonly reviewApproved: boolean;
  readonly value: PolicyValue;
  readonly unit: string;
}

/** listEffectiveRuleIds/describeRule/resolveEffect 세 표면만 갖춘 최소 registry. */
function factRegistry(rules: Record<string, FakeRule>): PolicyRegistry {
  return {
    describePack: () => ({ packKind: "VERIFIED_LAW", policySnapshot: "SNAP-1", packHash: "abcdef0123456789", ruleCount: 0 }),
    listEffectiveRuleIds: () => Object.keys(rules),
    describeRule: (id: string) => {
      const r = rules[id];
      if (r === undefined) throw new Error(`${id}: 없다`);
      return { sourceIds: r.sourceIds, reviewApproved: r.reviewApproved, validFrom: "2026-03-24", authorityType: "DECREE" };
    },
    resolveEffect: (id: string) => {
      const r = rules[id];
      if (r === undefined) throw new Error(`${id}: 없다`);
      return { value: { value: r.value, unit: r.unit }, stamp: {} };
    },
  } as never;
}

const RULES = {
  "A.LIMIT": { sourceIds: ["ART_1"], reviewApproved: true, value: { kind: "INTEGER", value: 18000000n } as PolicyValue, unit: "KRW" },
  "A.RATE": { sourceIds: ["ART_1"], reviewApproved: true, value: { kind: "RATE", numerator: 15n, denominator: 100n } as PolicyValue, unit: "RATE" },
  "B.DRAFT": { sourceIds: ["ART_2"], reviewApproved: false, value: { kind: "INTEGER", value: 999n } as PolicyValue, unit: "KRW" },
};

test("★ ① 은 조문 id 로 승인 규칙을 찾아 값을 그대로 인출한다", () => {
  const r = approvedFactsFor(factRegistry(RULES), [{ sourceId: "ART_1", label: "소득세법 시행령 제1조" }], "2026-08-04");
  assert.ok(r !== null);
  assert.deepEqual(r.facts.map((f) => f.ruleId), ["A.LIMIT", "A.RATE"]); // 규칙 id 순 — 화면 순서가 매번 같아야 한다
  assert.equal(r.facts[0]?.display, "18,000,000"); // 자릿수 구분만. 억/만 해석은 하지 않는다
  assert.equal(r.facts[0]?.unit, "KRW");
  assert.equal(r.facts[1]?.display, "15/100");
  assert.equal(r.policySnapshot, "SNAP-1");
});

test("★ 승인되지 않은 규칙은 값이 있어도 ① 에 나오지 않는다", () => {
  const r = approvedFactsFor(factRegistry(RULES), [{ sourceId: "ART_2", label: "소득세법 시행령 제2조" }], "2026-08-04");
  assert.deepEqual(r?.facts, []); // 숨기는 게 아니라 **0건**이다 — 화면이 "승인 필요"를 말할 수 있어야 한다
});

test("팩이 없으면 null — '0건'과 다른 상태다", () => {
  assert.equal(approvedFactsFor(null, [{ sourceId: "ART_1", label: "소득세법 시행령 제1조" }], "2026-08-04"), null);
});

test("인출이 거절되는 규칙은 추측해서 채우지 않고 건너뛴다", () => {
  const broken = factRegistry({
    "A.LIMIT": { ...RULES["A.LIMIT"], sourceIds: ["ART_1"] },
    "A.BOOM": { sourceIds: ["ART_1"], reviewApproved: true, value: { kind: "PLACEHOLDER", raw: "<미기재>" } as PolicyValue, unit: "KRW" },
  });
  const r = approvedFactsFor(broken, [{ sourceId: "ART_1", label: "소득세법 시행령 제1조" }], "2026-08-04");
  assert.deepEqual(r?.facts.map((f) => f.ruleId), ["A.LIMIT"]);
});
