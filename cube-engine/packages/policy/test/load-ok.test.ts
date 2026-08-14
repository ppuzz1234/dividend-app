/**
 * 정상 로딩 — 거절 검사가 지나치게 넓어 정상 팩까지 막고 있지 않은지 확인한다.
 * 거절 테스트만 있으면 "전부 거절"이라는 구현도 초록색이 된다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { loadAccountSpecs, loadPolicyPack } from "../src/index.js";
import { engine, pack, readAccountSpecsJson, specs } from "./helpers.js";

test("P01 정상 로딩", () => {
  const loadedPack = loadPolicyPack(pack());

  assert.equal(loadedPack.packKind, "SYNTHETIC_DEMO");
  assert.equal(loadedPack.policySnapshot, "DEMO-SYNTHETIC-0001");
  assert.match(loadedPack.packHash, /^[0-9a-f]{64}$/);
  assert.ok(loadedPack.ruleIds.length >= 11, `규칙 수: ${loadedPack.ruleIds.length}`);
  assert.ok(!("rules" in loadedPack), "규칙 본문이 공개 객체에 실리면 값이 스탬프 없이 샌다");

  const { accountSpecVersion } = readAccountSpecsJson();
  const loaded = loadAccountSpecs(specs(), loadedPack, engine(), accountSpecVersion);

  assert.equal(loaded.specs.length, 2);
  assert.equal(loaded.accountSpecVersion, accountSpecVersion);

  const [pension, taxable] = loaded.specs;
  assert.equal(pension!.accountId, "DEMO_PENSION_SAVINGS");
  assert.equal(pension!.mechanismInstances.length, 3);
  assert.equal(pension!.effectiveTo, undefined, "effectiveTo 미지정은 정상이다");

  // 일반계좌도 AccountSpec 을 갖는다 (사양 §5.3.1).
  assert.equal(taxable!.accountId, "DEMO_TAXABLE");
  assert.deepEqual([...taxable!.requiredEngineCapabilities].sort(), [
    "DIVIDEND_DISTRIBUTION_TAX",
    "FINANCIAL_INCOME_AGGREGATION",
    "TAXABLE_SALE_TAX",
  ]);
});

test("빈 계좌 목록도 정상이다 (팩만 로딩하는 경로)", () => {
  const loadedPack = loadPolicyPack(pack());
  const loaded = loadAccountSpecs([], loadedPack, engine(), "DEMO-SPECS-0001");
  assert.equal(loaded.specs.length, 0);
});

test("의존성이 있는 정상 구성은 통과한다", () => {
  // TAX_CREDIT → CONTRIBUTION_LIMIT 의존이 실제로 충족되는 구성이다.
  const loadedPack = loadPolicyPack(pack());
  const loaded = loadAccountSpecs(specs(), loadedPack, engine(), "DEMO-SPECS-0001");
  const types = loaded.specs[0]!.mechanismInstances.map((m) => m.mechanismType);
  assert.ok(types.includes("CONTRIBUTION_LIMIT"));
  assert.ok(types.includes("TAX_CREDIT"));
});
