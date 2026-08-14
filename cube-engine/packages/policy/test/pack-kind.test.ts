/**
 * 거절 매트릭스 B 절 — pack_kind 3종 (CLAUDE.md 절대 규칙 0, OPEN-Q1·Q2).
 *
 * 세 등급의 동작이 실제로 갈리는지 증명한다.
 *   VERIFIED_LAW     → 전 규칙 승인 + 서명 없으면 로딩 거절
 *   SYNTHETIC_DEMO   → 계산되지만 스탬프 강제 (스탬프 부재 경로 증명은 stamp-enforcement.test.ts)
 *   UNVERIFIED_DRAFT → 로딩은 되고 계산 진입에서 UnverifiedPolicyError
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SYNTHETIC_STAMP_TEXT,
  UnverifiedPolicyError,
  createRegistry,
  loadPolicyPack,
} from "../src/index.js";
import { VALUED_RULE_ID, expectReject, pack, ruleOf } from "./helpers.js";

const QUERY_DATE = "2026-07-30";

/**
 * VERIFIED_LAW fixture. 값은 여전히 합성이다 — 이 fixture 는 등급 분기 로직을 검증하기 위한 것이고
 * 실제 법률 팩이 아니다. 실제 세법 수치는 어디에도 넣지 않는다.
 */
function verifiedPack(): Record<string, any> {
  const p = pack();
  p["pack_kind"] = "VERIFIED_LAW";
  for (const rule of p["rules"]) {
    rule["review"] = { approved: true, reviewer_id: "DEMO_REVIEWER", reviewed_at: "2026-01-02" };
  }
  return p;
}

function draftPack(): Record<string, any> {
  const p = pack();
  p["pack_kind"] = "UNVERIFIED_DRAFT";
  return p;
}

test("R25 VERIFIED_LAW 미승인 규칙", () => {
  const p = verifiedPack();
  ruleOf(p, VALUED_RULE_ID)["review"]["approved"] = false;
  expectReject(() => loadPolicyPack(p), "VERIFIED_PACK_HAS_UNAPPROVED_RULE", "R25");
});

test("R26 VERIFIED_LAW 서명 부재", () => {
  const missingReviewer = verifiedPack();
  ruleOf(missingReviewer, VALUED_RULE_ID)["review"]["reviewer_id"] = null;
  expectReject(
    () => loadPolicyPack(missingReviewer),
    "VERIFIED_PACK_MISSING_REVIEW_SIGNATURE",
    "R26 (reviewer_id)",
  );

  const missingDate = verifiedPack();
  ruleOf(missingDate, VALUED_RULE_ID)["review"]["reviewed_at"] = null;
  expectReject(
    () => loadPolicyPack(missingDate),
    "VERIFIED_PACK_MISSING_REVIEW_SIGNATURE",
    "R26 (reviewed_at)",
  );

  // 승인 일자도 KST LocalDate 규약을 따라야 한다.
  const badDate = verifiedPack();
  ruleOf(badDate, VALUED_RULE_ID)["review"]["reviewed_at"] = "2026-01-02T00:00:00Z";
  expectReject(() => loadPolicyPack(badDate), "DATE_FORMAT_INVALID", "R26 (reviewed_at 형식)");
});

test("R27 UNVERIFIED_DRAFT 계산 진입", () => {
  const registry = createRegistry(loadPolicyPack(draftPack()));

  for (const call of [
    () => registry.resolveEffect(VALUED_RULE_ID, QUERY_DATE),
    () => registry.resolveConflictGroup("TAX_TREATMENT", "DEMO_RANKED", QUERY_DATE),
  ]) {
    assert.throws(call, (e: unknown) => {
      assert.ok(e instanceof UnverifiedPolicyError, `UnverifiedPolicyError 여야 한다: ${String(e)}`);
      assert.equal(e.packKind, "UNVERIFIED_DRAFT");
      return true;
    });
  }
});

test("R29 SYNTHETIC_DEMO 승인 참칭", () => {
  const p = pack(); // 기본이 SYNTHETIC_DEMO
  ruleOf(p, VALUED_RULE_ID)["review"]["approved"] = true;
  expectReject(() => loadPolicyPack(p), "SYNTHETIC_PACK_CLAIMS_APPROVAL", "R29");
});

test("P07 초안 로딩 성공", () => {
  // 로딩 자체는 정당하다. 막아야 하는 것은 값이 계산에 들어가는 순간뿐이다.
  const loaded = loadPolicyPack(draftPack());
  const registry = createRegistry(loaded);

  assert.equal(loaded.packKind, "UNVERIFIED_DRAFT");
  assert.ok(loaded.ruleIds.length > 0);
  // 메타데이터 조회는 열려 있다 — 초안 검토가 가능해야 한다.
  assert.equal(registry.describeRule(VALUED_RULE_ID).hasEffect, true);
  assert.ok(registry.listEffectiveRuleIds(QUERY_DATE).includes(VALUED_RULE_ID));
});

test("P08 VERIFIED_LAW 정상", () => {
  const registry = createRegistry(loadPolicyPack(verifiedPack()));
  const result = registry.resolveEffect(VALUED_RULE_ID, QUERY_DATE);

  assert.equal(result.stamp.packKind, "VERIFIED_LAW");
  assert.equal(result.stamp.synthetic, false);
  assert.equal(result.stamp.notice, null, "법률 등급에 합성 스탬프가 붙으면 안 된다");
  assert.equal(result.value.unit, "KRW");
});

test("SYNTHETIC_DEMO 는 계산되고 스탬프가 붙는다", () => {
  const registry = createRegistry(loadPolicyPack(pack()));
  const result = registry.resolveEffect(VALUED_RULE_ID, QUERY_DATE);

  assert.equal(result.stamp.packKind, "SYNTHETIC_DEMO");
  assert.equal(result.stamp.synthetic, true);
  assert.equal(result.stamp.notice, SYNTHETIC_STAMP_TEXT);
  assert.equal(result.value.value.kind, "INTEGER");
});

test("자리표시자가 남은 값은 등급과 무관하게 인출 불가", () => {
  // VERIFIED_LAW 는 로딩에서 막지만(R20), 다른 등급은 로딩을 통과한 뒤 인출에서 막아야 한다.
  const p = pack();
  ruleOf(p, VALUED_RULE_ID)["effect"]["value"] = "<원문 대조 후 기재>";
  const registry = createRegistry(loadPolicyPack(p));

  assert.throws(
    () => registry.resolveEffect(VALUED_RULE_ID, QUERY_DATE),
    (e: unknown) => e instanceof UnverifiedPolicyError,
  );
});
