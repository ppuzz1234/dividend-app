/**
 * 거절 매트릭스 A 절 — 정책 팩 / 규칙 (사양 §5.1).
 *
 * 모든 케이스는 "정상 fixture 를 한 군데만 망가뜨린다". 거절되는 것이 정답이다.
 */

import { test } from "node:test";

import { loadPolicyPack } from "../src/index.js";
import { VALUED_RULE_ID, expectReject, pack, ruleOf } from "./helpers.js";

test("R01 pack_kind 누락", () => {
  const p = pack();
  delete p["pack_kind"];
  expectReject(() => loadPolicyPack(p), "PACK_KIND_MISSING", "R01");
});

test("R02 pack_kind 열거 밖", () => {
  const p = pack();
  p["pack_kind"] = "MOSTLY_VERIFIED";
  expectReject(() => loadPolicyPack(p), "PACK_KIND_INVALID", "R02");
});

test("R03 policy_snapshot 누락", () => {
  const p = pack();
  delete p["policy_snapshot"];
  expectReject(() => loadPolicyPack(p), "SNAPSHOT_VERSION_MISSING", "R03");
});

test("R04 rule id 중복", () => {
  const p = pack();
  p["rules"].push(structuredClone(ruleOf(p, VALUED_RULE_ID)));
  expectReject(() => loadPolicyPack(p), "DUPLICATE_RULE_ID", "R04");
});

test("R05 PRIMARY source 부재", () => {
  const p = pack();
  // effect 는 그대로 두고 PRIMARY 역할만 강등한다 — source_id 는 남으므로 dangling 이 아니다.
  ruleOf(p, VALUED_RULE_ID)["sources"][0]["role"] = "IMPLEMENTING_DETAIL";
  expectReject(() => loadPolicyPack(p), "EFFECT_WITHOUT_PRIMARY_SOURCE", "R05");
});

test("R06 sources 빈 배열", () => {
  const p = pack();
  const r = ruleOf(p, VALUED_RULE_ID);
  r["sources"] = [];
  delete r["field_bindings"];
  expectReject(() => loadPolicyPack(p), "EMPTY_SOURCES", "R06");
});

test("R07 field_bindings dangling", () => {
  const p = pack();
  ruleOf(p, VALUED_RULE_ID)["field_bindings"]["effect_value"] = ["DEMO_SRC_NOT_DECLARED"];
  expectReject(() => loadPolicyPack(p), "DANGLING_FIELD_BINDING", "R07");
});

test("R08 lifecycle.status 열거 밖", () => {
  const p = pack();
  ruleOf(p, VALUED_RULE_ID)["lifecycle"]["status"] = "DRAFTING";
  expectReject(() => loadPolicyPack(p), "LIFECYCLE_STATUS_INVALID", "R08");
});

test("R09 시간 상태 저장", () => {
  const p = pack();
  // 값 전체가 CURRENT 일 때만 걸린다. CURRENT_YEAR_LIMIT 같은 정상 식별자는 통과해야 한다.
  ruleOf(p, VALUED_RULE_ID)["authority"]["conflict_group"] = "CURRENT";
  expectReject(() => loadPolicyPack(p), "TEMPORAL_STATE_STORED", "R09");

  const ok = pack();
  ruleOf(ok, VALUED_RULE_ID)["authority"]["conflict_group"] = "CURRENT_YEAR_LIMIT";
  loadPolicyPack(ok); // throw 하면 실패
});

test("R10 authority.type 열거 밖", () => {
  const p = pack();
  ruleOf(p, VALUED_RULE_ID)["authority"]["type"] = "MINISTRY_BLOG";
  expectReject(() => loadPolicyPack(p), "AUTHORITY_TYPE_INVALID", "R10");
});

test("R11 valid_from 누락", () => {
  const p = pack();
  delete ruleOf(p, VALUED_RULE_ID)["temporal"]["valid_from"];
  expectReject(() => loadPolicyPack(p), "VALID_FROM_MISSING", "R11");
});

test("R12 날짜 형식 오류", () => {
  for (const bad of ["2026-01-01T00:00:00Z", "2026/01/01", "20260101", "2026-1-1", "2026-01-01 "]) {
    const p = pack();
    ruleOf(p, VALUED_RULE_ID)["temporal"]["valid_from"] = bad;
    expectReject(() => loadPolicyPack(p), "DATE_FORMAT_INVALID", `R12 (${bad})`);
  }
});

test("R13 존재하지 않는 날짜", () => {
  for (const bad of ["2026-02-30", "2026-13-01", "2026-04-31", "2026-00-10"]) {
    const p = pack();
    ruleOf(p, VALUED_RULE_ID)["temporal"]["valid_from"] = bad;
    expectReject(() => loadPolicyPack(p), "DATE_NOT_A_CALENDAR_DATE", `R13 (${bad})`);
  }
  // 윤년은 통과해야 한다 — 검사가 지나치게 넓으면 정상 팩을 막는다.
  const leap = pack();
  ruleOf(leap, VALUED_RULE_ID)["temporal"]["valid_from"] = "2028-02-29";
  loadPolicyPack(leap);
});

test("R14 빈 유효구간", () => {
  const p = pack();
  const t = ruleOf(p, VALUED_RULE_ID)["temporal"];
  t["valid_to"] = t["valid_from"]; // 유효성식이 query_date < valid_to 이므로 공집합
  expectReject(() => loadPolicyPack(p), "EMPTY_VALIDITY_INTERVAL", "R14 (동일)");

  const q = pack();
  const t2 = ruleOf(q, VALUED_RULE_ID)["temporal"];
  t2["valid_to"] = "2025-01-01";
  expectReject(() => loadPolicyPack(q), "EMPTY_VALIDITY_INTERVAL", "R14 (역전)");
});

test("R15 rounding 불완전", () => {
  for (const key of ["stage", "mode", "unit_krw"]) {
    const p = pack();
    delete ruleOf(p, VALUED_RULE_ID)["effect"]["rounding"][key];
    expectReject(() => loadPolicyPack(p), "ROUNDING_SPEC_INCOMPLETE", `R15 (${key} 누락)`);
  }
});

test("R16 unit_krw <= 0", () => {
  for (const bad of ["0", "-10"]) {
    const p = pack();
    ruleOf(p, VALUED_RULE_ID)["effect"]["rounding"]["unit_krw"] = bad;
    expectReject(() => loadPolicyPack(p), "ROUNDING_UNIT_NOT_POSITIVE", `R16 (${bad})`);
  }
});

test("R17 rounding 열거 밖", () => {
  const p = pack();
  ruleOf(p, VALUED_RULE_ID)["effect"]["rounding"]["mode"] = "BANKERS";
  expectReject(() => loadPolicyPack(p), "ROUNDING_ENUM_INVALID", "R17 (mode)");

  const q = pack();
  ruleOf(q, VALUED_RULE_ID)["effect"]["rounding"]["stage"] = "PER_DECADE";
  expectReject(() => loadPolicyPack(q), "ROUNDING_ENUM_INVALID", "R17 (stage)");
});

test("R18 부동소수점 값", () => {
  // 정수 number 도 거절한다 — 열어두면 YAML 파서가 큰 값을 double 로 읽는 경로가 생긴다.
  const p = pack();
  ruleOf(p, VALUED_RULE_ID)["effect"]["value"] = 424242000;
  expectReject(() => loadPolicyPack(p), "FLOAT_IN_POLICY_VALUE", "R18 (정수 number)");

  const q = pack();
  ruleOf(q, "DEMO.CREDIT.RATE")["effect"]["value"]["numerator"] = 0.5;
  expectReject(() => loadPolicyPack(q), "FLOAT_IN_POLICY_VALUE", "R18 (소수)");

  const r = pack();
  ruleOf(r, "DEMO.CREDIT.RATE")["effect"]["value"] = "424242";
  expectReject(() => loadPolicyPack(r), "FLOAT_IN_POLICY_VALUE", "R18 (RATE 인데 스칼라)");
});

test("R19 분모 <= 0", () => {
  for (const bad of ["0", "-1000000"]) {
    const p = pack();
    ruleOf(p, "DEMO.CREDIT.RATE")["effect"]["value"]["denominator"] = bad;
    expectReject(() => loadPolicyPack(p), "RATE_DENOMINATOR_NOT_POSITIVE", `R19 (${bad})`);
  }
});

test("R20 VERIFIED_LAW 플레이스홀더", () => {
  const p = pack();
  p["pack_kind"] = "VERIFIED_LAW";
  for (const rule of p["rules"]) {
    rule["review"] = { approved: true, reviewer_id: "DEMO_REVIEWER", reviewed_at: "2026-01-02" };
  }
  ruleOf(p, VALUED_RULE_ID)["effect"]["value"] = "<원문 대조 후 기재>";
  expectReject(() => loadPolicyPack(p), "PLACEHOLDER_IN_VERIFIED_PACK", "R20");
});

test("R21 scope 누락", () => {
  for (const key of ["jurisdiction", "tax_years"]) {
    const p = pack();
    delete ruleOf(p, VALUED_RULE_ID)["scope"][key];
    expectReject(() => loadPolicyPack(p), "SCOPE_INCOMPLETE", `R21 (${key})`);
  }
});

test("R22 비안전 정수", () => {
  const p = pack();
  ruleOf(p, VALUED_RULE_ID)["scope"]["tax_years"] = [2026.5];
  expectReject(() => loadPolicyPack(p), "UNSAFE_INTEGER", "R22 (소수)");

  const q = pack();
  ruleOf(q, VALUED_RULE_ID)["scope"]["tax_years"] = [9007199254740993];
  expectReject(() => loadPolicyPack(q), "UNSAFE_INTEGER", "R22 (2^53 초과)");
});

test("R23 미지 필드", () => {
  const p = pack();
  p["extra_top_level"] = 1;
  expectReject(() => loadPolicyPack(p), "UNKNOWN_FIELD", "R23 (최상위)");

  const q = pack();
  ruleOf(q, VALUED_RULE_ID)["typo_field"] = 1;
  expectReject(() => loadPolicyPack(q), "UNKNOWN_FIELD", "R23 (규칙)");
});
