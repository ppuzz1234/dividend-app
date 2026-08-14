/**
 * 정책 팩 YAML 의 snake_case key 가 canonical ASCII 검사를 통과하는지 실제 fixture 로 확인한다
 * (작업 순서 6번). R31·R31b·P02·P06.
 *
 * 사양 §5.2.1 네이밍 계약의 핵심: 직렬화기는 ASCII [A-Za-z0-9_] 만 검사하고 표기법은 강제하지 않는다.
 * 언더스코어가 허용되므로 정책 팩 스냅샷 해싱이 통과해야 한다 — 통과하지 못하면 재현성이 깨진다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalHash, canonicalJson } from "@cube/numeric";

import { loadPolicyPack } from "../src/index.js";
import { VALUED_RULE_ID, expectReject, pack, readPackYaml, ruleOf } from "./helpers.js";

test("P02 snake_case 해시 통과", () => {
  const raw = readPackYaml();

  // 팩의 모든 key 가 실제로 snake_case ASCII 인지 먼저 확인한다.
  const keys = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      keys.add(k);
      walk(v);
    }
  };
  walk(raw);

  assert.ok(keys.has("pack_kind"), "fixture 가 snake_case 를 쓰고 있어야 검사가 의미 있다");
  assert.ok(keys.has("valid_from"));
  assert.ok(keys.has("conflict_group"));
  assert.ok(keys.has("field_bindings"));
  for (const k of keys) {
    assert.match(k, /^[A-Za-z0-9_]+$/, `canonical key 규칙 위반: ${k}`);
  }

  // numeric 의 canonical 경로가 실제로 통과한다.
  const json = canonicalJson(raw);
  assert.ok(json.includes('"pack_kind"'));
  assert.match(canonicalHash(raw), /^[0-9a-f]{64}$/);

  // 로더도 해시를 계산해 낸다.
  assert.equal(loadPolicyPack(pack()).packHash, canonicalHash(raw));
});

test("R31 비ASCII key 팩", () => {
  const p = pack();
  p["정책종류"] = "SYNTHETIC_DEMO";
  expectReject(() => loadPolicyPack(p), "NON_ASCII_KEY_IN_PACK", "R31 (최상위 한글 key)");

  const q = pack();
  ruleOf(q, VALUED_RULE_ID)["효과"] = {};
  expectReject(() => loadPolicyPack(q), "NON_ASCII_KEY_IN_PACK", "R31 (중첩 한글 key)");
});

test("R31b 점 포함 key", () => {
  // 사양 §5.1 예시의 `field_bindings: { "effect.value": [...] }` 형태다.
  // §5.2.1 canonical key 규칙과 모순이며 (OPEN-Q11) 해싱 불가이므로 거절한다.
  const p = pack();
  const bindings = ruleOf(p, VALUED_RULE_ID)["field_bindings"];
  delete bindings["effect_value"];
  bindings["effect.value"] = ["DEMO_SRC_PRIMARY"];
  expectReject(() => loadPolicyPack(p), "NON_ASCII_KEY_IN_PACK", "R31b (사양 §5.1 예시 형태)");

  // 하이픈도 같은 이유로 막힌다.
  const q = pack();
  q["policy-snapshot-alt"] = "x";
  expectReject(() => loadPolicyPack(q), "NON_ASCII_KEY_IN_PACK", "R31b (하이픈)");
});

test("P06 해시 재현성", () => {
  // 같은 입력 → 같은 해시. 서로 다른 로딩 호출이 같은 값을 내야 재현성 단위가 된다.
  const a = loadPolicyPack(pack());
  const b = loadPolicyPack(pack());
  assert.equal(a.packHash, b.packHash);

  // key 순서만 바뀐 동일 문서는 같은 해시다 (canonical 정렬).
  const shuffled = pack();
  const reordered: Record<string, unknown> = {
    rules: shuffled["rules"],
    policy_snapshot: shuffled["policy_snapshot"],
    pack_kind: shuffled["pack_kind"],
  };
  assert.equal(loadPolicyPack(reordered).packHash, a.packHash);

  // 값이 1 다르면 해시가 달라진다.
  const bumped = pack();
  ruleOf(bumped, VALUED_RULE_ID)["effect"]["value"] = "424242001";
  assert.notEqual(loadPolicyPack(bumped).packHash, a.packHash);
});
