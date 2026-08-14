/**
 * R28 — "스탬프 없이 결과를 반환하는 경로가 존재하지 않음"의 증명 (CLAUDE.md 절대 규칙 0).
 *
 * 세 층으로 증명한다.
 *   1. 값이 담긴 객체를 만드는 함수가 Registry 의 resolveEffect 계열뿐임을 **전수 열거**로 확인한다.
 *      새 메서드가 생기면 커버리지 검사가 먼저 실패하므로 검증 안 된 경로가 조용히 늘지 않는다.
 *   2. 합성 값 표식(SENTINEL)이 결과 어딘가에 나타나면 그 결과는 반드시 스탬프를 달고 있다.
 *   3. 타입 수준 증명은 brand.typecheck.ts 가 담당한다 (스탬프를 손으로 만들 수 없다).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalJson } from "@cube/numeric";

import {
  SYNTHETIC_STAMP_TEXT,
  createRegistry,
  loadAccountSpecs,
  loadPolicyPack,
  type PolicyRegistry,
} from "../src/index.js";
import { SYNTHETIC_SENTINEL, VALUED_RULE_ID, deepContains, engine, pack, specs } from "./helpers.js";

const QUERY_DATE = "2026-07-30";

/** 값을 돌려주는 메서드. 여기 있는 것만 스탬프 봉투를 반환해도 된다. */
const VALUE_RETURNING = new Set(["resolveEffect", "resolveConflictGroup"]);

/** 메서드명 → 호출 인자. 모든 메서드가 여기 있어야 한다 (커버리지 검사). */
const CALLS: Readonly<Record<string, readonly unknown[]>> = {
  describePack: [],
  describeRule: [VALUED_RULE_ID],
  listEffectiveRuleIds: [QUERY_DATE],
  stamp: [],
  resolveEffect: [VALUED_RULE_ID, QUERY_DATE],
  resolveConflictGroup: ["TAX_TREATMENT", "DEMO_CREDIT", QUERY_DATE],
};

function loadAll() {
  const loadedPack = loadPolicyPack(pack());
  const registry = createRegistry(loadedPack);
  return { loadedPack, registry };
}

test("R28 스탬프 없는 경로 부재 — Registry 표면 전수 검사", () => {
  const { loadedPack, registry } = loadAll();

  // 해시가 우연히 표식과 같은 숫자열을 포함하면 탐지가 오염된다. fixture 를 바꾸라는 신호다.
  assert.ok(
    !loadedPack.packHash.includes(SYNTHETIC_SENTINEL),
    "packHash 가 표식과 충돌한다 — fixture 의 합성 값을 다른 패턴으로 바꿔라",
  );

  const methodNames = Object.keys(registry).filter(
    (k) => typeof (registry as unknown as Record<string, unknown>)[k] === "function",
  );

  // 커버리지: 새 메서드가 추가되면 여기서 먼저 실패한다.
  assert.deepEqual(
    [...methodNames].sort(),
    Object.keys(CALLS).sort(),
    "Registry 에 검사되지 않은 메서드가 있다. CALLS 에 등록하고 스탬프 계약을 확인하라",
  );

  for (const name of methodNames) {
    const fn = (registry as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!;
    const result = fn(...(CALLS[name] as unknown[]));
    const leaks = deepContains(result, SYNTHETIC_SENTINEL);

    if (VALUE_RETURNING.has(name)) {
      const envelope = result as { value?: unknown; stamp?: Record<string, unknown> };
      assert.ok(envelope.stamp !== undefined, `${name}: 값 반환 메서드인데 스탬프가 없다`);
      assert.equal(envelope.stamp["synthetic"], true, `${name}: 합성 팩인데 synthetic 이 false 다`);
      assert.equal(envelope.stamp["notice"], SYNTHETIC_STAMP_TEXT, `${name}: 스탬프 문구가 다르다`);
      assert.ok(leaks, `${name}: 값을 돌려준다면서 합성 값이 안 보인다 — 검사가 무의미해졌다`);
    } else {
      assert.ok(
        !leaks,
        `${name}: 스탬프 봉투 밖으로 합성 값이 샜다. 값은 resolveEffect 계열로만 나가야 한다`,
      );
    }
  }
});

test("R28 로딩 산출물에도 값이 실리지 않는다", () => {
  const { loadedPack } = loadAll();
  const loadedSpecs = loadAccountSpecs(specs(), loadedPack, engine(), "DEMO-SPECS-0001");

  for (const [label, obj] of [
    ["LoadedPolicyPack", loadedPack],
    ["LoadedAccountSpecs", loadedSpecs],
  ] as const) {
    assert.ok(
      !deepContains(obj, SYNTHETIC_SENTINEL),
      `${label} 에 정책 값이 실려 있다 — 로딩 결과만으로 스탬프 없이 값을 읽을 수 있게 된다`,
    );
  }

  // 직렬화해도 마찬가지다 (로그·매니페스트로 새는 경로).
  assert.ok(!canonicalJson(loadedPack).includes(SYNTHETIC_SENTINEL));
});

test("R28 메타데이터 조회는 값을 노출하지 않는다", () => {
  const { registry } = loadAll();

  const meta = registry.describeRule(VALUED_RULE_ID);
  assert.equal(meta.hasEffect, true, "값이 있다는 사실은 알려준다");
  assert.ok(!deepContains(meta, SYNTHETIC_SENTINEL), "그러나 값 자체는 주지 않는다");

  assert.ok(!deepContains(registry.listEffectiveRuleIds(QUERY_DATE), SYNTHETIC_SENTINEL));
  assert.ok(!deepContains(registry.describePack(), SYNTHETIC_SENTINEL));
  assert.ok(!deepContains(registry.stamp(), SYNTHETIC_SENTINEL));
});

test("R28 스탬프는 팩 등급을 그대로 반영한다", () => {
  const synthetic = createRegistry(loadPolicyPack(pack())).stamp();
  assert.equal(synthetic.synthetic, true);
  assert.equal(synthetic.notice, SYNTHETIC_STAMP_TEXT);

  const verifiedRaw = pack();
  verifiedRaw["pack_kind"] = "VERIFIED_LAW";
  for (const r of verifiedRaw["rules"]) {
    r["review"] = { approved: true, reviewer_id: "DEMO_REVIEWER", reviewed_at: "2026-01-02" };
  }
  const verified = createRegistry(loadPolicyPack(verifiedRaw)).stamp();
  assert.equal(verified.synthetic, false);
  assert.equal(verified.notice, null);
});

test("R28 같은 Registry 의 모든 결과가 동일 스탬프를 공유한다", () => {
  const { registry } = loadAll();
  const a = registry.resolveEffect(VALUED_RULE_ID, QUERY_DATE).stamp;
  const b = registry.resolveConflictGroup("TAX_TREATMENT", "DEMO_CREDIT", QUERY_DATE).stamp;
  // 참조 동일성까지 같아야 한다 — 경로마다 스탬프를 새로 만들면 한 곳만 빠뜨리기 쉽다.
  assert.equal(a, b);
  assert.equal(a, registry.stamp());
});

function assertRegistryShape(r: PolicyRegistry): void {
  assert.equal(typeof r.resolveEffect, "function");
}

test("PolicyRegistry 타입 표면이 유지된다", () => {
  assertRegistryShape(loadAll().registry);
});
