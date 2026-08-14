/**
 * 거절 매트릭스 H 절 + 정상 조회 — Registry 조회일 기준 유효 규칙 계산 (사양 §5.1).
 *
 * 핵심 계약: 시간 상태를 저장하지 않고 조회 시점에 계산한다 (사양 P2 · §5.1).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createRegistry, loadPolicyPack } from "../src/index.js";
import { VALUED_RULE_ID, expectReject, pack, ruleOf } from "./helpers.js";

const QUERY_DATE = "2026-07-30";

function registry(mutate?: (p: Record<string, any>) => void) {
  const p = pack();
  mutate?.(p);
  return createRegistry(loadPolicyPack(p));
}

test("R24 서열 동률 충돌", () => {
  // DEMO_RANKED 그룹의 ADMIN_GUIDANCE 를 STATUTE 로 올려 같은 서열 둘을 만든다.
  const reg = registry((p) => {
    ruleOf(p, "DEMO.RANKED.GUIDANCE")["authority"]["type"] = "STATUTE";
  });
  const err = expectReject(
    () => reg.resolveConflictGroup("TAX_TREATMENT", "DEMO_RANKED", QUERY_DATE),
    "UNRESOLVABLE_CONFLICT",
    "R24",
  );
  assert.match(err.message, /DEMO\.RANKED\.STATUTE/);
  assert.match(err.message, /DEMO\.RANKED\.GUIDANCE/);
});

test("R61 PROPOSED 인출", () => {
  const reg = registry();
  expectReject(() => reg.resolveEffect("DEMO.PROPOSED.DRAFT", QUERY_DATE), "RULE_NOT_ENACTED", "R61");
});

test("R62 REPEALED 인출", () => {
  const reg = registry();
  // 조회일이 폐지 규칙의 옛 유효구간 안이어도 일반 조회로는 인출할 수 없다.
  for (const date of [QUERY_DATE, "2022-06-01"]) {
    expectReject(
      () => reg.resolveEffect("DEMO.REPEALED.OLD", date),
      "RULE_NOT_EFFECTIVE_AT_DATE",
      `R62 (${date})`,
    );
  }
});

test("R63 시행 전 조회", () => {
  const reg = registry();
  expectReject(
    () => reg.resolveEffect("DEMO.FUTURE.NOTYET", QUERY_DATE),
    "RULE_NOT_EFFECTIVE_AT_DATE",
    "R63",
  );
  // 시행일 당일은 유효하다 (valid_from <= d).
  reg.resolveEffect("DEMO.FUTURE.NOTYET", "2030-01-01");
});

test("R64 만료 경계", () => {
  const reg = registry();
  // 유효성식은 d < valid_to 이므로 valid_to 당일은 이미 무효다.
  reg.resolveEffect("DEMO.SUNSET.BOUNDED", "2026-12-31");
  expectReject(
    () => reg.resolveEffect("DEMO.SUNSET.BOUNDED", "2027-01-01"),
    "RULE_NOT_EFFECTIVE_AT_DATE",
    "R64 (valid_to 당일)",
  );
});

test("R65 미존재 규칙", () => {
  const reg = registry();
  expectReject(() => reg.resolveEffect("DEMO.NOWHERE", QUERY_DATE), "RULE_NOT_FOUND", "R65");
  expectReject(() => reg.describeRule("DEMO.NOWHERE"), "RULE_NOT_FOUND", "R65 (describe)");
  // effect 가 없는 참조 규칙에서 값을 인출할 수 없다.
  expectReject(
    () => reg.resolveEffect("DEMO.ELIGIBILITY.RESIDENT", QUERY_DATE),
    "RULE_NOT_FOUND",
    "R65 (effect 없음)",
  );
});

test("R66 조회일 형식 오류", () => {
  const reg = registry();
  for (const bad of ["2026-07-30T00:00:00Z", "2026/07/30", "20260730"]) {
    expectReject(() => reg.resolveEffect(VALUED_RULE_ID, bad), "DATE_FORMAT_INVALID", `R66 (${bad})`);
    expectReject(() => reg.listEffectiveRuleIds(bad), "DATE_FORMAT_INVALID", `R66 list (${bad})`);
  }
  expectReject(() => reg.resolveEffect(VALUED_RULE_ID, "2026-02-30"), "DATE_NOT_A_CALENDAR_DATE", "R66 (달력)");
});

test("P03 조회일 기준 재계산", () => {
  const loaded = loadPolicyPack(pack());
  const reg = createRegistry(loaded);

  const at2026 = reg.listEffectiveRuleIds("2026-07-30");
  const at2030 = reg.listEffectiveRuleIds("2030-07-30");
  const at2022 = reg.listEffectiveRuleIds("2022-07-30");

  assert.ok(at2026.includes("DEMO.SUNSET.BOUNDED"), "2026 에는 일몰 전 규칙이 유효하다");
  assert.ok(!at2030.includes("DEMO.SUNSET.BOUNDED"), "2030 에는 일몰됐다");
  assert.ok(!at2026.includes("DEMO.FUTURE.NOTYET"), "2026 에는 미시행이다");
  assert.ok(at2030.includes("DEMO.FUTURE.NOTYET"), "2030 에는 시행됐다");
  assert.ok(!at2022.includes(VALUED_RULE_ID), "2022 에는 아직 시행 전이다");

  // PROPOSED·REPEALED 는 어느 조회일에도 유효 목록에 없다.
  for (const list of [at2022, at2026, at2030]) {
    assert.ok(!list.includes("DEMO.PROPOSED.DRAFT"));
    assert.ok(!list.includes("DEMO.REPEALED.OLD"));
  }

  // 팩 객체에는 어떤 시간 상태도 쓰이지 않는다 — 조회를 반복해도 같은 결과다 (사양 P2).
  assert.deepEqual(reg.listEffectiveRuleIds("2026-07-30"), at2026);
  assert.deepEqual(reg.describePack(), {
    packKind: "SYNTHETIC_DEMO",
    policySnapshot: loaded.policySnapshot,
    packHash: loaded.packHash,
    ruleCount: loaded.ruleIds.length,
  });
});

test("P04 축이 다르면 병렬", () => {
  const reg = registry();
  // 같은 applies_to(TAX_TREATMENT) 라도 conflict_group 이 다르면 충돌이 아니다.
  const credit = reg.resolveConflictGroup("TAX_TREATMENT", "DEMO_CREDIT", QUERY_DATE);
  const deferral = reg.resolveConflictGroup("TAX_TREATMENT", "DEMO_DEFERRAL", QUERY_DATE);
  assert.equal(credit.value.unit, "RATE");
  assert.equal(deferral.value.unit, "COUNT");
});

test("P05 서열 해소", () => {
  const reg = registry();
  // STATUTE 가 ADMIN_GUIDANCE 를 이긴다 (§5.1 서열).
  const won = reg.resolveConflictGroup("TAX_TREATMENT", "DEMO_RANKED", QUERY_DATE);
  assert.equal(won.value.value.kind, "INTEGER");
  assert.equal(
    won.value.value.kind === "INTEGER" ? won.value.value.value : -1n,
    424242001n,
    "STATUTE 쪽 값이어야 한다",
  );
});

test("describeRule 은 effect 값을 담지 않는다", () => {
  const meta = registry().describeRule(VALUED_RULE_ID);
  assert.equal(meta.hasEffect, true);
  assert.ok(!("effect" in meta), "메타데이터에 effect 가 들어가면 스탬프 없이 값이 샌다");
  assert.ok(!("value" in meta));
});
