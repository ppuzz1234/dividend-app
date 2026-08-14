/**
 * 거절 매트릭스 C 절 — AccountSpec (사양 §5.3.1 커버리지 검사 · §5.3.2).
 */

import { test } from "node:test";

import { loadAccountSpecs, loadPolicyPack } from "../src/index.js";
import { engine, expectReject, pack, spec, specs } from "./helpers.js";

const SPEC_VERSION = "DEMO-SPECS-0001";

function load(rawSpecs: unknown[], eng = engine()) {
  const loadedPack = loadPolicyPack(pack());
  return loadAccountSpecs(rawSpecs, loadedPack, eng, SPEC_VERSION);
}

test("R30 accountId 비ASCII", () => {
  for (const bad of ["연금저축", "DEMO-PENSION", "DEMO.PENSION", "DEMO PENSION"]) {
    const s = spec();
    s["accountId"] = bad;
    expectReject(() => load([s]), "IDENTIFIER_NOT_ASCII", `R30 (${bad})`);
  }
});

test("R32 accountId 중복", () => {
  const [a, b] = specs();
  b!["accountId"] = a!["accountId"];
  // 두 spec 의 메커니즘 구성이 달라도 계좌 조회가 비결정적이 되는 것은 같다.
  expectReject(() => load([a, b]), "DUPLICATE_ACCOUNT_ID", "R32");
});

test("R33 커버리지 검사 실패", () => {
  // 엔진이 TAX_CREDIT 을 지원하지 않는 상황. 부분 계산 없이 로딩을 거절해야 한다.
  const eng = engine();
  const reduced = {
    engineBuildVersion: eng.engineBuildVersion,
    mechanisms: eng.mechanisms.filter((m) => m.mechanismType !== "TAX_CREDIT"),
  };
  expectReject(() => load([spec()], reduced), "CAPABILITY_NOT_SUPPORTED", "R33");
});

test("R34 미선언 mechanismType", () => {
  const s = spec();
  // 인스턴스는 그대로 두고 선언에서만 뺀다 — 커버리지 검사를 우회하는 구멍이다.
  s["requiredEngineCapabilities"] = s["requiredEngineCapabilities"].filter(
    (t: string) => t !== "TAX_CREDIT",
  );
  expectReject(() => load([s]), "UNDECLARED_MECHANISM_TYPE", "R34");
});

test("R35 어휘 밖 mechanismType", () => {
  const s = spec();
  s["mechanismInstances"][0]["mechanismType"] = "MAGIC_DISCOUNT";
  expectReject(() => load([s]), "MECHANISM_TYPE_UNKNOWN", "R35 (인스턴스)");

  const q = spec();
  q["requiredEngineCapabilities"].push("MAGIC_DISCOUNT");
  expectReject(() => load([q]), "MECHANISM_TYPE_UNKNOWN", "R35 (선언)");
});

test("R37 parameterRuleIds dangling", () => {
  const s = spec();
  s["mechanismInstances"][0]["parameterRuleIds"] = ["DEMO.NOT.IN.PACK"];
  expectReject(() => load([s]), "DANGLING_RULE_REFERENCE", "R37");
});

test("R38 eligibility dangling", () => {
  const s = spec();
  s["eligibilityRuleIds"] = ["DEMO.NOT.IN.PACK"];
  expectReject(() => load([s]), "DANGLING_RULE_REFERENCE", "R38 (eligibility)");

  const q = spec();
  q["instrumentEligibilityRuleIds"] = ["DEMO.NOT.IN.PACK"];
  expectReject(() => load([q]), "DANGLING_RULE_REFERENCE", "R38 (instrument)");
});

test("R39 spec 빈 유효구간", () => {
  const s = spec();
  s["effectiveTo"] = s["effectiveFrom"];
  expectReject(() => load([s]), "EMPTY_VALIDITY_INTERVAL", "R39 (동일)");

  const q = spec();
  q["effectiveTo"] = "2025-01-01";
  expectReject(() => load([q]), "EMPTY_VALIDITY_INTERVAL", "R39 (역전)");
});

test("R40 supportedEvents 열거 밖", () => {
  const s = spec();
  s["supportedEvents"] = ["CONTRIBUTION", "TELEPORT"];
  expectReject(() => load([s]), "PLAN_EVENT_TYPE_UNKNOWN", "R40");
});

test("R41 priority 비안전 정수", () => {
  for (const bad of [1.5, 9007199254740993, -9007199254740993]) {
    const s = spec();
    s["mechanismInstances"][0]["priority"] = bad;
    expectReject(() => load([s]), "UNSAFE_INTEGER", `R41 (${bad})`);
  }

  // NaN·Infinity 는 ajv 의 type:number 가 isFinite 까지 검사해 스키마 층에서 먼저 걸린다.
  // 거절된다는 결론은 같고 code 만 다르다 — 검사를 약화시키지 않고 기대를 실제 계층에 맞춘다.
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const s = spec();
    s["mechanismInstances"][0]["priority"] = bad;
    expectReject(() => load([s]), "SCHEMA_VIOLATION", `R41 (${bad})`);
  }
});

test("R42 sourceIds 빈 배열", () => {
  const s = spec();
  s["sourceIds"] = [];
  expectReject(() => load([s]), "EMPTY_SOURCES", "R42");
});

test("AccountSpec 미지 필드도 거절한다", () => {
  const s = spec();
  s["notAField"] = true;
  expectReject(() => load([s]), "UNKNOWN_FIELD", "spec 미지 필드");
});

test("AccountSpec 날짜도 KST LocalDate 규약을 따른다", () => {
  const s = spec();
  s["effectiveFrom"] = "2026-01-01T00:00:00+09:00";
  expectReject(() => load([s]), "DATE_FORMAT_INVALID", "spec 날짜 형식");
});
